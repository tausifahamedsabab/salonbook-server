const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Appointment = require('../models/Appointment');
const { serializePayment, serializeTransaction } = require('../utils/serialize');
const { stripe } = require('../services/stripe');

function serviceNameFor(appointmentId) {
  if (appointmentId && typeof appointmentId === 'object' && appointmentId.serviceName) {
    return appointmentId.serviceName;
  }
  return '';
}

async function getPayments(req, res) {
  const query = req.user.role === 'admin' ? {} : { customerId: req.user.id };
  const payments = await Payment.find(query)
    .populate('appointmentId', 'serviceName appointmentDate serviceId')
    .sort({ createdAt: -1 });
  return res.json({ success: true, payments: payments.map(serializePayment) });
}

async function getPayment(req, res) {
  const query = { _id: req.params.id };
  if (req.user.role !== 'admin') query.customerId = req.user.id;
  const payment = await Payment.findOne(query)
    .populate('appointmentId', 'serviceName appointmentDate serviceId');
  if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
  const transaction = await Transaction.findOne({ paymentId: payment._id });
  const data = serializePayment(payment);
  data.transaction = transaction ? serializeTransaction(transaction) : null;
  return res.json({ success: true, payment: data });
}

async function createCheckout(req, res) {
  const { appointmentId } = req.params;
  const appointment = await Appointment.findById(appointmentId).populate('serviceId', 'name serviceName appointmentDate');
  if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });
  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file.' });
  }
  const payment = await Payment.findOne({ appointmentId: appointment._id });
  if (!payment || payment.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'This appointment is not awaiting payment' });
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: payment.currency || 'usd',
          unit_amount: payment.amount,
          product_data: { name: appointment.serviceName || 'Salon service' },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/customer/payment/success?paymentId=${payment._id}`,
    cancel_url: `${appUrl}/customer/payment/cancel?paymentId=${payment._id}`,
    customer_email: req.user.email,
    metadata: { appointmentId: appointment._id.toString(), customerId: req.user.id },
    allow_promotion_codes: true,
  });
  payment.stripeCheckoutSessionId = session.id;
  await payment.save();
  return res.json({ success: true, sessionId: session.id, url: session.url });
}

/**
 * Create (or fetch) the transaction record for a payment. Idempotent.
 */
async function createTransactionForPayment(payment, { status = 'paid', receiptUrl = '' } = {}) {
  const existing = await Transaction.findOne({ paymentId: payment._id }).sort({ createdAt: -1 }).exec();
  if (existing) return existing;
  return Transaction.create({
    paymentId: payment._id,
    appointmentId: payment.appointmentId,
    customerId: payment.customerId,
    serviceName: serviceNameFor(payment.appointmentId),
    amount: payment.amount,
    currency: payment.currency || 'usd',
    status,
    stripeCheckoutSessionId: payment.stripeCheckoutSessionId || '',
    receiptUrl,
  });
}

/**
 * Mark a payment as paid after verified confirmation and save its transaction.
 * Idempotent: returns the transaction even when called repeatedly.
 */
async function markPaid(payment, extra = {}) {
  if (!payment.stripeCheckoutSessionId && !extra.sessionId) return null;
  payment.status = 'paid';
  if (extra.receiptUrl) payment.receiptUrl = extra.receiptUrl;
  await payment.save();
  return createTransactionForPayment(payment, { status: 'paid', receiptUrl: extra.receiptUrl || payment.receiptUrl || '' });
}

/**
 * GET /api/payments/:id/verify — used by the Stripe payment success page.
 * Asks Stripe if the checkout session completed, and when it did, marks the
 * payment as paid and saves the transaction (idempotent).
 */
async function verifyPayment(req, res) {
  const payment = await Payment.findOne({ _id: req.params.id });
  if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

  const isOwner = String(payment.customerId) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ success: false, error: 'You can only verify your own payments' });
  }

  if (!payment.stripeCheckoutSessionId) {
    // No checkout session created yet — read-only check, webhook is the source of truth.
    const transaction = await Transaction.findOne({ paymentId: payment._id }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      paid: payment.status === 'paid',
      payment: serializePayment(payment),
      transaction: transaction ? serializeTransaction(transaction) : null,
    });
  }

  if (!stripe) {
    return res.json({ success: true, paid: payment.status === 'paid', payment: serializePayment(payment) });
  }

  const session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
  if (session.status === 'complete') {
    const transaction = await markPaid(payment, { receiptUrl: session.receipt_url || '' });
    return res.json({ success: true, paid: true, payment: serializePayment(payment), transaction: serializeTransaction(transaction) });
  }
  return res.json({ success: true, paid: payment.status === 'paid', payment: serializePayment(payment) });
}

module.exports = { getPayments, getPayment, createCheckout, verifyPayment, createTransactionForPayment, markPaid };
