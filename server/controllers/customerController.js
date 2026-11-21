const mongoose = require('mongoose');

function userDocToCustomer(u, stats) {
  return {
    _id: u.id || String(u._id),
    id: u.id || String(u._id),
    name: u.name,
    email: u.email,
    role: u.role || 'customer',
    blocked: Boolean(u.blocked),
    createdAt: u.createdAt,
    ...stats,
  };
}

async function statsForUser(db, userId) {
  const appointments = await db.collection('appointments').find({ customerId: userId }).toArray();
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
  const paidCount = await db.collection('payments').countDocuments({ customerId: userId, status: 'paid' });
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
  await users.updateOne({ _id: doc._id }, { $set: { blocked } });
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
