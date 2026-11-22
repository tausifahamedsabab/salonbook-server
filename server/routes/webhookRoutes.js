const express = require('express');
const { stripe } = require('../services/stripe');
const Payment = require('../models/Payment');
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
  const findPayment = async (id) => (id ? Payment.findOne({ stripeCheckoutSessionId: id }).catch(() => null) : null);

  if (event.type === 'checkout.session.completed') {
    // Mark payment paid only after a verified signature — never from the success URL alone.
    const payment = (await findPayment(sessionId)) || Payment.findOne({ appointmentId: metadata.appointmentId }).catch(() => null);
    if (payment) {
      await markPaid(payment, { receiptUrl: event.data.object.receipt_url || '' });
    }
  } else if (event.type === 'checkout.session.expired') {
    const payment = (await findPayment(sessionId)) || Payment.findOne({ appointmentId: metadata.appointmentId }).catch(() => null);
    if (payment) {
      await markFailed(payment, 'Payment session expired.');
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const payment = (await Payment.findOne({ stripePaymentIntentId: event.data.object.id }).catch(() => null))
      || (metadata.appointmentId ? await Payment.findOne({ appointmentId: metadata.appointmentId }).catch(() => null) : null);
    if (payment) {
      await markFailed(payment, 'Payment failed.');
    }
  }

  return res.json({ success: true, received: true });
}

router.post('/stripe', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
module.exports.handleWebhook = handleWebhook;
