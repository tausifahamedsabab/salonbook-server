const mongoose = require('mongoose');
const Service = require('../models/Service');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');

// Admin dashboard overview statistics.
async function getAdminStats(req, res) {
  const users = mongoose.connection.db.collection('user');
  const [totalCustomers, activeServices, totalAppointments, pendingAppointments, confirmedAppointments, totalSuccessfulPayments] =
    await Promise.all([
      // Users without a role are customers (Better Auth doesn't default the field).
      users.countDocuments({ role: { $nin: ['admin'] } }),
      Service.countDocuments({ isActive: true }),
      Appointment.countDocuments({}),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.countDocuments({ status: 'confirmed' }),
      Payment.countDocuments({ status: 'paid' }),
    ]);
  return res.json({
    success: true,
    stats: {
      totalCustomers,
      totalActiveServices: activeServices,
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      totalSuccessfulPayments,
    },
  });
}

module.exports = { getAdminStats };
