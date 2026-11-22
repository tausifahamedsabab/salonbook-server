const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  customerId: { type: String, required: true },
  customerEmail: { type: String, default: '' },
  serviceName: { type: String, default: '' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  status: { type: String, enum: ['paid', 'failed', 'cancelled'], default: 'paid' },
  stripeCheckoutSessionId: { type: String, default: '' },
  receiptUrl: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
