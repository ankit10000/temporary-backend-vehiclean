require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { verifyToken } = require('./utils/jwt');
const { recoverStaleAssignments } = require('./utils/assignmentTimeout');

// Route imports
const authRoutes = require('./routes/authRoutes');
const carRoutes = require('./routes/carRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const productRoutes = require('./routes/productRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const server = http.createServer(app);

// Trust proxy — required for rate limiting behind load balancer/reverse proxy
app.set('trust proxy', 1);

// CORS — restrict to known origins
const allowedOrigins = [
  process.env.USER_APP_URL,
  process.env.PARTNER_APP_URL,
  process.env.ADMIN_PANEL_URL,
].filter(Boolean);

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? allowedOrigins
    : true, // Allow all in development
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
};

// Socket.io setup — with connection limits and restricted CORS
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 1e6, // 1MB max message size
  pingInterval: 25000,
  pingTimeout: 20000,
  connectTimeout: 10000,
});

// Track connections per user to prevent abuse
const userSocketCount = new Map();
const MAX_SOCKETS_PER_USER = 3;

// Make io accessible in routes
app.set('io', io);

// Connect to MongoDB, then recover stale assignments
const dbReady = connectDB().then(() => {
  if (process.env.VERCEL !== '1') {
    recoverStaleAssignments(app);
  }
});

// Ensure DB is connected before handling requests (important for serverless)
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression()); // gzip response compression — ~70% bandwidth savings
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));

// Skip rate limiting for internal load tests (development only)
const skipIfLoadTest = (req) =>
  process.env.NODE_ENV !== 'production' && req.headers['x-load-test'] === 'true';

// Rate limiting — different tiers for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLoadTest,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Stricter for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLoadTest,
  message: { success: false, message: 'Too many login attempts, please try again later' },
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // Booking creation is expensive
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipIfLoadTest,
  message: { success: false, message: 'Too many booking requests, please try again later' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/bookings', bookingLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/products', productRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Vehiclean API is running' });
});

// Socket.io JWT authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = verifyToken(token);
    socket.user = decoded; // { id, role }

    // Enforce per-user connection limit
    const userId = decoded.id;
    const count = userSocketCount.get(userId) || 0;
    if (count >= MAX_SOCKETS_PER_USER) {
      return next(new Error('Too many connections'));
    }

    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Socket.io events
io.on('connection', (socket) => {
  const userId = socket.user?.id;

  // Track connection count
  userSocketCount.set(userId, (userSocketCount.get(userId) || 0) + 1);

  socket.on('join', (data) => {
    // Validate: only allow joining your own room
    if (data.id !== socket.user.id || data.role !== socket.user.role) {
      return;
    }
    const room = `${data.role}_${data.id}`;
    socket.join(room);
  });

  socket.on('partner_location', (data) => {
    if (data.bookingId) {
      io.to(`booking_${data.bookingId}`).emit('location_update', data);
    }
  });

  socket.on('join_booking', (data) => {
    if (data.bookingId) {
      socket.join(`booking_${data.bookingId}`);
    }
  });

  socket.on('chat_message', async (data) => {
    if (!data.bookingId || !data.text) return;
    const Message = require('./models/Message');
    try {
      const message = await Message.create({
        bookingId: data.bookingId,
        senderId: socket.user.id,
        senderRole: socket.user.role,
        text: data.text,
      });
      io.to(`booking_${data.bookingId}`).emit('new_message', message);
    } catch (err) {
      console.error('[Chat] Message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    // Decrement connection count
    const count = userSocketCount.get(userId) || 1;
    if (count <= 1) {
      userSocketCount.delete(userId);
    } else {
      userSocketCount.set(userId, count - 1);
    }
  });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
}

// Graceful shutdown — clean up connections on SIGTERM/SIGINT
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');

    // Disconnect all socket clients
    io.close(() => {
      console.log('Socket.io server closed');

      // Close MongoDB connection
      const mongoose = require('mongoose');
      mongoose.connection.close(false).then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, io };
