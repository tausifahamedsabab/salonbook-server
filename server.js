require('dotenv/config');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');
const { seed } = require('./seed');

const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const customerRoutes = require('./routes/customerRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req, res) => res.json({ success: true, ok: true }));

app.use((err, req, res, next) => {
  console.error(`[server] Unhandled error: ${err && err.stack ? err.stack : err}`);
  return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Internal server error' });
});

app.use((req, res) => {
  return res.status(404).json({ success: false, error: 'Not found' });
});

async function main() {
  await connectDB();
  await seed();
  app.listen(PORT, () => {
    console.log(`[server] REST API listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Startup failed:', err);
  process.exit(1);
});
