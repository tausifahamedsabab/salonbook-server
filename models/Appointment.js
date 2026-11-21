const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  serviceName: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now },
  appointmentDate: { type: Date, required: true },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
