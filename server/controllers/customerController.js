const mongoose = require('mongoose');

async function listCustomers(req, res) {
  // Users are managed by Better Auth (users collection).
  const users = await mongoose.connection.db.collection('users').find({ role: 'customer' }).sort({ createdAt: 1 }).toArray();

  const customers = await Promise.all(
    users.map(async (u) => {
      const appointments = await mongoose.connection.db.collection('appointments').find({ customerId: u.id }).toArray();
      const pendingCount = appointments.filter((a) => a.status === 'pending').length;
      const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
      const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
      const paidCount = await mongoose.connection.db.collection('payments').countDocuments({ customerId: u.id, status: 'paid' });

      return {
        _id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        appointmentCount: appointments.length,
        pendingCount,
        confirmedCount,
        cancelledCount,
        paidCount,
      };
    })
  );

  return res.json({ success: true, customers });
}

module.exports = { listCustomers };
