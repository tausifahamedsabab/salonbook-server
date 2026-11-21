const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const { serializePayment } = require('../utils/serialize');
const { stripe } = require('../services/stripe');

async function getPayments(req, res) {
  const query = req.user.role === 'admin' ? {} : { customerId: req.user.id };
  const payments = await Payment.find(query)
    .populate('appointmentId', 'serviceName appointmentDate serviceId')
    .sort({ createdAt: -1 });
  return res.json({ success: true, payments: payments.map(serializePayment) });
}

async function getPayment(req, res) {
  const query = { _id: req.params.id, customerId: req.user.id };
  const payment = await Payment.findOne(query)
    .populate('appointmentId', 'serviceName appointmentDate');
  if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
  return res.json({ success: true, payment: serializePayment(payment) });
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
    success_url: `${appUrl}/customer/appointments?paid=1`,
    cancel_url: `${appUrl}/customer/appointments`,
    customer_email: req.user.email,
    metadata: { appointmentId: appointment._id.toString(), customerId: req.user.id },
    allow_promotion_codes: true,
  });
  payment.stripeCheckoutSessionId = session.id;
  await payment.save();
  return res.json({ success: true, sessionId: session.id, url: session.url });
}

module.exports = { getPayments, getPayment, createCheckout };
