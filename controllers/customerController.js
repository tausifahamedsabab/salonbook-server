const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');

async function listCustomers(req, res) {
  const customers = await User.find({ role: 'customer' }).select('name email role').sort({ name: 1 });
  const customersWithStats = await Promise.all(
    customers.map(async (c) => {
      const [appointmentCount, pendingCount, confirmedCount, paidCount] = await Promise.all([
        Appointment.countDocuments({ customerId: c._id }),
        Appointment.countDocuments({ customerId: c._id, status: 'pending' }),
        Appointment.countDocuments({ customerId: c._id, status: 'confirmed' }),
        Payment.countDocuments({ customerId: c._id, status: 'paid' }),
      ]);
      const plain = c.toObject({ virtuals: true });
      return {
        _id: plain._id.toString(),
        userId: plain._id.toString(),
        name: plain.name,
        email: plain.email,
        role: plain.role,
        appointmentCount,
        pendingCount,
        confirmedCount,
        paidCount,
        createdAt: plain.createdAt ? new Date(plain.createdAt).toISOString() : null,
      };
    })
  );
  return res.json({ success: true, customers: customersWithStats });
}

module.exports = { listCustomers };
