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

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: appointment.servicePrice || 0,
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
  appointment.stripeCheckoutSessionId = session.id;
  await appointment.save();
  return res.json({ success: true, sessionId: session.id, url: session.url });
}

/**
 * Mark an appointment as paid (idempotent) and record its transaction.
 * The webhook and verify endpoint both funnel through here.
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
 * Asks Stripe if the checkout session completed and marks the appointment
 * as paid via the idempotent markPaid() (which saves the transaction).
 */
async function verifyPayment(req, res) {
  const appointment = await Appointment.findOne({ _id: req.params.id });
  if (!appointment) return res.status(404).json({ success: false, error: 'Payment not found' });

  const isOwner = String(appointment.customerId) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only verify your own payments' });
  }

  if (appointment.stripeCheckoutSessionId && stripe) {
    const session = await stripe.checkout.sessions.retrieve(appointment.stripeCheckoutSessionId);
    if (session.status === 'complete') {
      await markPaid(appointment, { receiptUrl: session.receipt_url || '' });
    }
  }

  const transaction = await Transaction.findOne({ appointmentId: appointment._id }).sort({ createdAt: -1 });
  const data = paymentSummary(appointment);
  data.transaction = transaction ? serializeTransaction(transaction) : null;
  return res.json({ success: true, paid: appointment.paymentStatus === 'paid', payment: data, transaction: data.transaction });
}

module.exports = { getPayments, getPayment, createCheckout, verifyPayment, markPaid, markFailed, paymentSummary };
