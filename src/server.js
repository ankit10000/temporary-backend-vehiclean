require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

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

// Trust proxy — required for rate limiting behind load balancer/reverse proxy
app.set('trust proxy', 1);

// CORS — restrict to known origins
const allowedOrigins = [
  process.env.USER_APP_URL,
  process.env.PARTNER_APP_URL,
  process.env.ADMIN_PANEL_URL,
].filter(Boolean);

const corsOptions = {
  origin: (process.env.NODE_ENV === 'production' && allowedOrigins.length > 0)
    ? (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        // Allow exact matches or any *.vercel.app subdomain
        if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      }
    : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
};

// Health check (no DB needed)
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Vehiclean API is running' });
});
// Connect to MongoDB (lazy — only connects on first API request that needs DB)
let dbReady = null;
const ensureDB = () => {
  if (!dbReady) {
    dbReady = connectDB().catch((err) => {
      console.error('DB connection failed:', err.message);
      dbReady = null; // Reset so it retries on next request
      throw err;
    });
  }
  return dbReady;
};

// Ensure DB is connected before handling requests (important for serverless)
app.use(async (req, res, next) => {
  try {
    await ensureDB();
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

// Error handler
app.use(errorHandler);

// Always export the Express app (Vercel serverless needs this)
module.exports = app;

// Socket.io and HTTP server — only outside Vercel (serverless doesn't support WebSockets)
if (!process.env.VERCEL) {
  const http = require('http');
  const { Server } = require('socket.io');
  const { verifyToken } = require('./utils/jwt');
  const { recoverStaleAssignments } = require('./utils/assignmentTimeout');

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: corsOptions,
    maxHttpBufferSize: 1e6,
    pingInterval: 25000,
    pingTimeout: 20000,
    connectTimeout: 10000,
  });

  const userSocketCount = new Map();
  const MAX_SOCKETS_PER_USER = 3;

  app.set('io', io);

  // Recover stale assignments after DB connects
  ensureDB().then(() => recoverStaleAssignments(app));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = verifyToken(token);
      socket.user = decoded;
      const count = userSocketCount.get(decoded.id) || 0;
      if (count >= MAX_SOCKETS_PER_USER) return next(new Error('Too many connections'));
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    userSocketCount.set(userId, (userSocketCount.get(userId) || 0) + 1);

    socket.on('join', (data) => {
      if (data.id !== socket.user.id || data.role !== socket.user.role) return;
      socket.join(`${data.role}_${data.id}`);
    });

    socket.on('partner_location', (data) => {
      if (data.bookingId) io.to(`booking_${data.bookingId}`).emit('location_update', data);
    });

    socket.on('join_booking', (data) => {
      if (data.bookingId) socket.join(`booking_${data.bookingId}`);
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
      const count = userSocketCount.get(userId) || 1;
      if (count <= 1) userSocketCount.delete(userId);
      else userSocketCount.set(userId, count - 1);
    });
  });

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });

  const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      io.close(() => {
        const mongoose = require('mongoose');
        mongoose.connection.close(false).then(() => process.exit(0));
      });
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  module.exports = { app, server, io };
}
