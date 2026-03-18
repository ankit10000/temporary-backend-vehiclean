/**
 * Test-friendly Express app setup.
 * Mirrors backend/src/server.js but WITHOUT calling connectDB() or server.listen().
 * MongoMemoryServer connection is managed by setup.js.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Override env vars for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.JWT_EXPIRE = '30d';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const errorHandler = require('../src/middleware/errorHandler');

// Route imports
const authRoutes = require('../src/routes/authRoutes');
const carRoutes = require('../src/routes/carRoutes');
const serviceRoutes = require('../src/routes/serviceRoutes');
const bannerRoutes = require('../src/routes/bannerRoutes');
const bookingRoutes = require('../src/routes/bookingRoutes');
const paymentRoutes = require('../src/routes/paymentRoutes');
const partnerRoutes = require('../src/routes/partnerRoutes');
const adminRoutes = require('../src/routes/adminRoutes');
const userRoutes = require('../src/routes/userRoutes');
const reviewRoutes = require('../src/routes/reviewRoutes');
const productRoutes = require('../src/routes/productRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io setup (in-memory, no external connections)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
app.set('io', io);

// Middleware (skip morgan in tests to keep output clean)
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// NOTE: No rate limiting in tests so requests are not throttled

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'AutoSpark API is running' });
});

// Error handler
app.use(errorHandler);

module.exports = app;
