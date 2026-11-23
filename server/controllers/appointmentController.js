const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const { TIME_SLOTS } = require('../constants');
const { serializeAppointment } = require('../utils/serialize');

function dateKeyInTimeZone(timeZone) {
  const zone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
}

function minutesInTimeZone(timeZone) {
  const zone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

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
  const { serviceId, appointmentDate, timeSlot, message: messageInput, notes, timezone } = req.body || {};
  if (!serviceId || !appointmentDate) {
    return res.status(400).json({ success: false, error: 'serviceId and appointmentDate are required' });
  }

  const rawDate = String(appointmentDate);
  const dateKey = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return res.status(400).json({ success: false, error: 'appointmentDate must be a valid date (YYYY-MM-DD)' });
  }
  const probe = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== dateKey) {
    return res.status(400).json({ success: false, error: 'appointmentDate must be a valid date' });
  }
  const slotRaw = timeSlot || (rawDate.includes('T') ? rawDate.slice(11, 16) : '');
  const slot = slotRaw ? String(slotRaw) : '';
  if (slot && !TIME_SLOTS.includes(slot)) {
    return res.status(400).json({ success: false, error: 'Invalid time slot' });
  }

  // "Today" is computed in the browser's timezone so local users are never
  // rejected because the server runs in UTC.
  const zone = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC';
  const todayKey = dateKeyInTimeZone(zone);
  if (dateKey < todayKey) {
    return res.status(400).json({ success: false, error: 'Appointment date cannot be in the past.' });
  }
  if (dateKey === todayKey && slot) {
    const [hour, minute] = slot.split(':').map(Number);
    const now = minutesInTimeZone(zone);
    if (now !== null && hour * 60 + minute <= now) {
      return res.status(400).json({ success: false, error: 'This time slot has already passed today.' });
    }
  }

  const date = new Date(`${dateKey}T${slot || '00:00'}:00`);
  const service = await Service.findById(serviceId);
  const serviceStatus = service ? (service.status || (service.isActive === false ? 'inactive' : 'active')) : 'inactive';
  if (!service || serviceStatus !== 'active') {
    return res.status(404).json({ success: false, error: 'Service not found' });
  }
  // Duplicate prevention: an active booking for the same service at the same
  // date + time slot blocks a new request.
  const duplicate = await Appointment.findOne({
    serviceId: service._id,
    appointmentDate: date,
    status: { $ne: 'cancelled' },
  });
  if (duplicate && (slot ? duplicate.timeSlot === slot : true)) {
    return res.status(409).json({ success: false, error: 'This time slot is already booked.' });
  }
  const message = messageInput !== undefined ? messageInput : notes;
  const appointment = await Appointment.create({
    customerId: req.user.id,
    serviceId: service._id,
    serviceName: service.name,
    servicePrice: Number(service.price),
    appointmentDate: date,
    timeSlot: slot,
    message: message ? String(message) : '',
    status: 'pending',
    paymentStatus: 'unpaid',
  });
  return res.status(201).json({ success: true, appointment: serializeAppointment(appointment) });
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
