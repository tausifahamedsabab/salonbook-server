const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  customerId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  status: { type: String, enum: ['pending', 'paid', 'refunded', 'failed'], default: 'pending' },
  paymentProvider: { type: String, default: 'stripe' },
  stripeCheckoutSessionId: { type: String, default: '' },
  stripePaymentIntentId: { type: String, default: '' },
  receiptUrl: { type: String, default: '' },
  paidAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
