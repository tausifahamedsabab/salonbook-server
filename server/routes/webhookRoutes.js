const express = require('express');
const { stripe } = require('../services/stripe');
const Appointment = require('../models/Appointment');
const { markPaid, markFailed } = require('../controllers/paymentController');

const router = express.Router();

/**
 * Shared webhook handler. Register it for the Stripe events below.
 * Idempotent: terminal payment statuses are never overwritten.
 */
async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return res.status(400).json({ success: false, error: 'Stripe webhook signing secret is not configured' });
  }

  let event;
  try {
    // constructEvent reads the raw request body — it must not be JSON-parsed first.
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    return res.status(400).json({ success: false, error: `Webhook signature verification failed: ${err.message}` });
  }

  const sessionId = event.data.object?.id;
  const metadata = event.data.object?.metadata || {};
  const findAppointment = async (id) =>
    (id ? Appointment.findOne({ stripeCheckoutSessionId: id }).catch(() => null) : null);

  if (event.type === 'checkout.session.completed') {
    // Mark the appointment paid after a verified signature — never from the success URL alone.
    const appointment =
      (await findAppointment(sessionId)) ||
      (metadata.appointmentId ? await Appointment.findOne({ _id: metadata.appointmentId }).catch(() => null) : null);
    if (appointment) {
      await markPaid(appointment, { receiptUrl: event.data.object.receipt_url || '' });
    }
  } else if (event.type === 'checkout.session.expired') {
    const appointment =
      (await findAppointment(sessionId)) ||
      (metadata.appointmentId ? await Appointment.findOne({ _id: metadata.appointmentId }).catch(() => null) : null);
    if (appointment) {
      await markFailed(appointment);
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const appointment = metadata.appointmentId
      ? await Appointment.findOne({ _id: metadata.appointmentId }).catch(() => null)
      : null;
    if (appointment) {
      await markFailed(appointment);
    }
  }

  return res.json({ success: true, received: true });
}

router.post('/stripe', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
module.exports.handleWebhook = handleWebhook;
