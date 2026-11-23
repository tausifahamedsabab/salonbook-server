const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Transaction = require('../models/Transaction');
const { serializeAppointment, serializeTransaction } = require('../utils/serialize');
const { stripe } = require('../services/stripe');

/**
 * Payment summary: the appointment, serialized with the customer-facing
 * payment fields (status = appointment.paymentStatus, amount = servicePrice).
 */
function paymentSummary(a) {
  const plain = serializeAppointment(a);
  return {
    _id: String(a._id),
    appointmentId: String(a._id),
    customerId: plain.customerId,
    service: a.serviceName || null,
    serviceId: plain.serviceId,
    appointmentDate: plain.appointmentDate,
    amount: a.servicePrice || 0,
    currency: 'usd',
    status: a.paymentStatus || 'unpaid',
    stripeSessionId: a.stripeCheckoutSessionId || '',
    receiptUrl: null,
    createdAt: plain.createdAt,
  };
}

async function getPayments(req, res) {
  const query = req.user.role === 'admin' ? {} : { customerId: req.user.id };
  const appointments = await Appointment.find(query).sort({ requestedAt: -1 });
  const payments = [];
  for (const a of appointments) {
    const payment = paymentSummary(a);
    const transaction = await Transaction.findOne({ appointmentId: a._id }).sort({ createdAt: -1 });
    if (transaction) payment.receiptUrl = transaction.receiptUrl || null;
    payments.push(payment);
  }
  return res.json({ success: true, payments });
}

async function getPayment(req, res) {
  const query = { _id: req.params.id };
  if (req.user.role !== 'admin') query.customerId = req.user.id;
  const appointment = await Appointment.findOne(query);
  if (!appointment) return res.status(404).json({ success: false, error: 'Payment not found' });
  const transaction = await Transaction.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
  const data = paymentSummary(appointment);
  data.transaction = transaction ? serializeTransaction(transaction) : null;
  return res.json({ success: true, payment: data });
}

async function createCheckout(req, res) {
  const { appointmentId } = req.params;
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });

  // Ownership: the payer must be the appointment's customer (admins can pay for customers).
  const isOwner = String(appointment.customerId) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only pay for your own appointments' });
  }

  // Only confirmed appointments can be paid.
  if (appointment.status !== 'confirmed') {
    return res.status(400).json({ success: false, error: 'Appointment must be confirmed before payment' });
  }

  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.' });
  }

  if (appointment.paymentStatus !== 'unpaid') {
    return res.status(400).json({ success: false, error: 'This appointment is not awaiting payment' });
  }

  // Idempotency: reuse the existing session if one was already created.
  if (appointment.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(appointment.stripeCheckoutSessionId);
      if (session.status !== 'expired') {
        return res.json({ success: true, sessionId: session.id, url: session.url });
      }
    } catch { /* fall through and create a fresh session */ }
  }

  // Stripe redirect URLs must point at the deployed client in production.
  const appUrl = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  if (!appUrl) {
    return res.status(500).json({ success: false, error: 'APP_URL is not configured' });
  }
  // Stripe Checkout requires a minimum charge of $0.50 (50 cents).
  const amount = Number(appointment.servicePrice) || 0;
  if (amount < 50) {
    return res.status(400).json({
      success: false,
      error: 'This appointment amount is below the $0.50 minimum for online payment. Please contact the salon.',
    });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: appointment.serviceName || 'Salon service' },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/customer/payment/success?paymentId=${appointment._id}`,
      cancel_url: `${appUrl}/customer/payment/cancel?paymentId=${appointment._id}`,
      customer_email: req.user.email || '',
      metadata: { appointmentId: appointment._id.toString(), customerId: String(appointment.customerId) },
      allow_promotion_codes: true,
    });
  } catch (err) {
    console.error('[stripe] checkout session creation failed:', err && err.message ? err.message : err);
    return res.status(502).json({ success: false, error: 'Could not start checkout. Please try again later.' });
  }
  appointment.stripeCheckoutSessionId = session.id;
  await appointment.save();
  return res.json({ success: true, sessionId: session.id, url: session.url });
}

/**
 * Mark an appointment as paid (idempotent) and record its transaction.
 * Only the signature-verified Stripe webhook may call this.
 */
async function markPaid(appointment, extra = {}) {
  if (!appointment || appointment.paymentStatus !== 'unpaid') return null;
  appointment.paymentStatus = 'paid';
  await appointment.save();
  const existing = await Transaction.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
  if (existing) return existing;
  return Transaction.create({
    appointmentId: appointment._id,
    customerId: new mongoose.Types.ObjectId(appointment.customerId),
    amount: appointment.servicePrice || 0,
    currency: 'usd',
    stripeSessionId: appointment.stripeCheckoutSessionId || '',
    status: 'paid',
    receiptUrl: extra.receiptUrl || '',
  });
}

/**
 * Mark an appointment payment as failed (session expired / payment intent failed).
 * Idempotent: skips payments already paid or already marked failed.
 */
async function markFailed(appointment) {
  if (!appointment || appointment.paymentStatus === 'paid') return null;
  appointment.paymentStatus = 'unpaid'; // spec: paymentStatus is (unpaid or paid)
  await appointment.save();
  const existing = await Transaction.findOne({ appointmentId: appointment._id, status: 'failed' });
  if (existing) return existing;
  return Transaction.create({
    appointmentId: appointment._id,
    customerId: new mongoose.Types.ObjectId(appointment.customerId),
    amount: appointment.servicePrice || 0,
    currency: 'usd',
    stripeSessionId: appointment.stripeCheckoutSessionId || '',
    status: 'failed',
  });
}

/**
 * GET /api/payments/:id/verify — used by the Stripe payment success page.
 * READ-ONLY: payment status and transactions are written only by the verified
 * Stripe webhook (webhookRoutes.js). This endpoint just reports the current
 * stored state so the success page can poll until the webhook lands.
 */
async function verifyPayment(req, res) {
  const appointment = await Appointment.findOne({ _id: req.params.id });
  if (!appointment) return res.status(404).json({ success: false, error: 'Payment not found' });

  const isOwner = String(appointment.customerId) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only verify your own payments' });
  }

  const transaction = await Transaction.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
  const data = paymentSummary(appointment);
  data.transaction = transaction ? serializeTransaction(transaction) : null;
  return res.json({ success: true, paid: appointment.paymentStatus === 'paid', payment: data, transaction: data.transaction });
}

module.exports = { getPayments, getPayment, createCheckout, verifyPayment, markPaid, markFailed, paymentSummary };
