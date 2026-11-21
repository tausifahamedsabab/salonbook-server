const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { issueToken } = require('../utils/jwt');
const { serializeUser } = require('../utils/serialize');

const MIN_PASSWORD_LENGTH = 6;

async function register(req, res) {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email and password are required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(400).json({ success: false, error: 'An account with this email already exists' });
  }
  // Only allow admin role on public registration when explicitly enabled.
  const canRegisterAsAdmin = process.env.ALLOW_ADMIN_REGISTRATION === 'true';
  const userRole = role === 'admin' && canRegisterAsAdmin ? 'admin' : 'customer';
  const passwordHash = await bcrypt.hash(String(password).trim(), 10);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    role: userRole,
  });
  return res.status(201).json({ success: true, user: serializeUser(user), token: issueToken(user) });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  const isValid = await bcrypt.compare(String(password), user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  return res.json({ success: true, user: serializeUser(user), token: issueToken(user) });
}

async function logout(req, res) {
  // Tokens are stateless; the client clears its stored token on logout.
  return res.json({ success: true });
}

module.exports = { register, login, logout };
