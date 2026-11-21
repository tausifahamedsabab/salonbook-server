const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'usd' },
  status: { type: String, enum: ['pending', 'paid', 'refunded', 'failed'], default: 'pending' },
  stripeCheckoutSessionId: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
