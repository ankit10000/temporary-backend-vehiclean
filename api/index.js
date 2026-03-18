// Vercel serverless entry point
try {
  const app = require('../src/server');
  module.exports = app;
} catch (err) {
  // If server.js fails to load, return error details
  module.exports = (req, res) => {
    res.status(500).json({
      error: true,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
    });
  };
}
