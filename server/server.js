require('dotenv/config');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

async function createApp() {
  await connectDB();
  const { getAuth } = require('./auth');
  const { toNodeHandler } = require('better-auth/node');
  const { seed } = require('./seed');

  const app = express();
  const PORT = process.env.PORT || 5000;

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '5mb' }));

  // Better Auth handles /api/auth/* (sign up, sign in, get session, sign out, ...).
  // express.json() runs first so Better Auth serializes the parsed body from req.body.
  app.all('/api/auth/*splat', toNodeHandler(getAuth()));

  app.use('/api/services', require('./routes/serviceRoutes'));
  app.use('/api/admin', require('./routes/adminStatsRoutes'));
  app.use('/api/admin/transactions', require('./routes/transactionRoutes'));
  app.use('/api/transactions', require('./routes/transactionRoutes'));
  app.use('/api/users/profile', require('./routes/profileRoutes'));
  app.use('/api/appointments', require('./routes/appointmentRoutes'));
  app.use('/api/payments', require('./routes/paymentRoutes'));
  app.use('/api/customers', require('./routes/customerRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/webhooks', require('./routes/webhookRoutes'));

  app.get('/health', (req, res) => res.json({ success: true, ok: true }));

  app.use((err, req, res, next) => {
    console.error(`[server] Unhandled error: ${err && err.stack ? err.stack : err}`);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Internal server error' });
  });

  app.use((req, res) => {
    return res.status(404).json({ success: false, error: 'Not found' });
  });

  await seed();
  return { app, port: PORT };
}

createApp()
  .then(({ app, port }) => {
    app.listen(port, () => {
      console.log(`[server] REST API listening on http://127.0.0.1:${port}`);
    });
  })
  .catch((err) => {
    console.error('[server] Startup failed:', err);
    process.exit(1);
  });
