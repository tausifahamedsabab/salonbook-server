// Vercel serverless entry point: export the configured Express application.
// vercel.json routes every incoming path to this function; Express does the
// route matching internally, exactly as it does locally.
const { app } = require('../server/server');

module.exports = app;
