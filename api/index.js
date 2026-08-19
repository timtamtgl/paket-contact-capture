// Vercel serverless entry point
process.env.VERCEL = process.env.VERCEL || '1';

try {
  const app = require('../server');
  module.exports = app;
} catch (err) {
  console.error('❌ Failed to load server:', err);
  // Return a minimal Express app as fallback
  const express = require('express');
  const fallback = express();
  fallback.get('*', (req, res) => {
    res.status(500).json({ error: 'Server failed to start', details: err.message });
  });
  module.exports = fallback;
}
