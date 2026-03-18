const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,       // Max concurrent connections (default: 10)
      minPoolSize: 10,       // Keep warm connections ready
      maxIdleTimeMS: 30000,  // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Fail fast if DB is unreachable
      socketTimeoutMS: 45000,         // Kill slow queries after 45s
    });
    console.log(`MongoDB Connected: ${conn.connection.host} (pool: 10-50)`);
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
