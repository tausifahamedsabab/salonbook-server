const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Payment = require('../models/Payment');
const { serializeAppointment } = require('../utils/serialize');

async function getAppointments(req, res) {
  // Admins see every appointment request; customers see only their own.
  const query = req.user.role === 'admin' ? {} : { customerId: req.user.id };
  if (req.query.status && req.query.status !== 'all') query.status = String(req.query.status);
  const appointments = await Appointment.find(query)
    .populate('serviceId', 'name price category')
    .sort({ requestedAt: -1 });
  return res.json({ success: true, appointments: appointments.map(serializeAppointment) });
}

async function createAppointment(req, res) {
  const { serviceId, appointmentDate, timeSlot, notes } = req.body || {};
  if (!serviceId || !appointmentDate) {
    return res.status(400).json({ success: false, error: 'serviceId and appointmentDate are required' });
  }
  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) {
    return res.status(400).json({ success: false, error: 'appointmentDate must be a valid date/time' });
  }
  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }
  // Duplicate prevention: an active booking for the same service at the same
  // date + time slot blocks a new request.
  const duplicate = await Appointment.findOne({
    serviceId: service._id,
    appointmentDate: date,
    status: { $ne: 'cancelled' },
  });
  if (duplicate && (timeSlot ? duplicate.timeSlot === String(timeSlot) : true)) {
    return res.status(409).json({ success: false, error: 'This time slot is already booked.' });
  }
  const appointment = await Appointment.create({
    customerId: req.user.id,
    serviceId: service._id,
    serviceName: service.name,
    appointmentDate: date,
    timeSlot: timeSlot ? String(timeSlot) : '',
    notes: notes ? String(notes) : '',
    status: 'pending',
    paymentStatus: 'unpaid',
  });
  const payment = await Payment.create({
    appointmentId: appointment._id,
    customerId: req.user.id,
    amount: Number(service.price) * 100,
    currency: 'usd',
    status: 'pending',
  });
  return res.status(201).json({ success: true, appointment: serializeAppointment(appointment), payment });
}

async function confirmAppointment(req, res) {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });
  if (appointment.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Only pending appointments can be confirmed' });
  }
  appointment.status = 'confirmed';
  await appointment.save();
  return res.json({ success: true, appointment: serializeAppointment(appointment) });
}

async function cancelAppointment(req, res) {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });
  const isOwner = String(appointment.customerId) === String(req.user.id);
  const isAdmin = req.user.role === 'admin';
  // Customers cancel their own pending requests. Admins can cancel
  // pending or confirmed requests.
  if (appointment.status === 'confirmed' && !isAdmin) {
    return res.status(400).json({ success: false, error: 'Confirmed appointments can only be cancelled by admins' });
  }
  if (appointment.status === 'pending' && !isOwner && !isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only cancel your own appointments' });
  }
  if (appointment.status === 'cancelled' || appointment.status === 'confirmed') {
    if (!isAdmin && appointment.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending appointments can be cancelled' });
    }
  }
  appointment.status = 'cancelled';
  await appointment.save();
  return res.json({ success: true, appointment: serializeAppointment(appointment) });
}

module.exports = { getAppointments, createAppointment, confirmAppointment, cancelAppointment };
