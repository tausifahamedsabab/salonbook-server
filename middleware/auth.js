const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../utils/jwt');

function extractToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  if (req.query && req.query.token) return req.query.token;
  if (req.body && req.body.token) return req.body.token;
  return undefined;
}

async function getUserFromToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  if (!payload || !payload.userId) return null;
  try {
    return await User.findById(payload.userId);
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await getUserFromToken(extractToken(req));
  if (!user) {
    return res.status(401).json({ success: false, error: 'Please authenticate to continue' });
  }
  req.user = user;
  next();
}

function requireRole(role) {
  return async function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ success: false, error: `This action requires the ${role} role` });
    }
    next();
  };
}

module.exports = { extractToken, getUserFromToken, requireAuth, requireRole };
