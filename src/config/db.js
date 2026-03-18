const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected || mongoose.connection.readyState === 1) {
    return;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,       // Max concurrent connections (default: 10)
      minPoolSize: 10,       // Keep warm connections ready
      maxIdleTimeMS: 30000,  // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Fail fast if DB is unreachable
      socketTimeoutMS: 45000,         // Kill slow queries after 45s
    });
    isConnected = true;
    console.log(`MongoDB Connected: ${conn.connection.host} (pool: 10-50)`);
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    if (process.env.VERCEL !== '1') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
