const mongoose = require('mongoose');

function userDocToCustomer(u, stats) {
  return {
    _id: u.id || String(u._id),
    id: u.id || String(u._id),
    name: u.name,
    email: u.email,
    role: u.role || 'customer',
    isBlocked: Boolean(u.isBlocked),
    createdAt: u.createdAt,
    ...stats,
  };
}

async function statsForUser(db, userId) {
  // Appointment.customerId is a ref (ObjectId); legacy rows stored it as a
  // string — compare as strings so both match.
  const appointments = (await db.collection('appointments').find({}).toArray())
    .filter((a) => String(a.customerId) === String(userId));
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
  const paidCount = appointments.filter((a) => a.paymentStatus === 'paid').length;
  return {
    appointmentCount: appointments.length,
    pendingCount,
    confirmedCount,
    cancelledCount,
    paidCount,
  };
}

async function listCustomers(req, res) {
  // Users are managed by Better Auth (the `user` collection).
  const db = mongoose.connection.db;
  // Users without a role field default to 'customer' (admins are excluded).
  const users = (await db.collection('user').find({}).sort({ createdAt: 1 }).toArray())
    .filter((u) => (u.role || 'customer') !== 'admin');

  const customers = await Promise.all(users.map(async (u) => userDocToCustomer(u, await statsForUser(db, u.id || String(u._id)))));

  return res.json({ success: true, customers });
}

function findUserDoc(users, id) {
  const ObjectId = mongoose.Types.ObjectId;
  let byObjectId = null;
  try {
    byObjectId = users.findOne({ _id: new ObjectId(id) }).catch(() => null);
  } catch {
    byObjectId = null;
  }
  const chain = [
    users.findOne({ _id: id }).catch(() => null),
    byObjectId,
    users.findOne({ id }).catch(() => null),
    users.findOne({ email: id }).catch(() => null),
  ];
  return chain.reduce((p, next) => p.then((d) => d || next), Promise.resolve(null));
}

async function setBlocked(req, res, blocked) {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'User id is required' });
  const users = mongoose.connection.db.collection('user');
  const doc = await findUserDoc(users, id);
  if (!doc) return res.status(404).json({ success: false, error: 'User not found' });
  await users.updateOne({ _id: doc._id }, { $set: { isBlocked: blocked } });
  const after = await users.findOne({ _id: doc._id }).catch(() => null);
  return res.json({
    success: true,
    user: userDocToCustomer(after || doc, {}),
  });
}

async function blockUser(req, res) {
  return setBlocked(req, res, true);
}

async function unblockUser(req, res) {
  return setBlocked(req, res, false);
}

module.exports = { listCustomers, blockUser, unblockUser };
