const mongoose = require('mongoose');
const { serializeUser } = require('../utils/serialize');

// Fields customers/admins may edit on their own profile.
const ALLOWED_FIELDS = ['name', 'image', 'phone'];
const LOCKED_FIELDS = ['role', 'isBlocked'];

function findUserById(id) {
  const col = mongoose.connection.db.collection('user');
  return col.findOne({ _id: new mongoose.Types.ObjectId(id) });
}

function serializeProfile(user) {
  const plain = serializeUser(user) || {};
  return {
    _id: plain.id || String(user._id),
    name: plain.name || '',
    email: plain.email || '',
    image: plain.image || null,
    phone: plain.phone || '',
    role: plain.role || 'customer',
    isBlocked: Boolean(plain.isBlocked),
    createdAt: plain.createdAt,
  };
}

async function getProfile(req, res) {
  const user = await findUserById(req.params.id || req.user.id).catch(() => null);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  return res.json({ success: true, profile: serializeProfile(user) });
}

async function updateProfile(req, res) {
  const body = req.body || {};
  const id = req.params.id || req.user.id;

  // Locked fields can't be changed through profile updates.
  const locked = LOCKED_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (locked.length) {
    return res.status(400).json({ success: false, error: `Cannot change ${locked.join(', ')} via profile updates` });
  }

  // Ownership: only the user themself, or an admin editing anyone.
  const target = await findUserById(id).catch(() => null);
  if (!target) return res.status(404).json({ success: false, error: 'User not found' });
  const owner = String(target._id) === String(req.user.id);
  if (!owner && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'You can only update your own profile' });
  }

  const set = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) set[field] = String(body[field] ?? '');
  }
  const col = mongoose.connection.db.collection('user');
  if (Object.keys(set).length) {
    await col.updateOne({ _id: target._id }, { $set: set });
  }
  const updated = await col.findOne({ _id: target._id });
  return res.json({ success: true, profile: serializeProfile(updated) });
}

module.exports = { getProfile, updateProfile };
