const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  category: { type: String, default: 'general', trim: true },
  price: { type: Number, required: true, min: 0 },
  durationMinutes: { type: Number, default: 60, min: 5 },
  imageUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
