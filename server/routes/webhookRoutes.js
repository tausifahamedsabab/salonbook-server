const express = require('express');
const { stripe } = require('../services/stripe');
const Payment = require('../models/Payment');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return res.status(400).json({ success: false, error: 'Stripe webhook signing secret is not configured' });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    return res.status(400).json({ success: false, error: `Webhook signature verification failed: ${err.message}` });
  }
  if (event.type === 'checkout.session.completed') {
    const metadata = event.data.object.metadata || {};
    const appointmentId = metadata.appointmentId;
    if (appointmentId) {
      await Payment.updateOne({ appointmentId, status: 'pending' }, { status: 'paid' });
    }
  }
  return res.json({ success: true, received: true });
});

module.exports = router;
