// Vercel serverless entry point
process.env.VERCEL = process.env.VERCEL || '1';
const app = require('../server');
module.exports = app;
