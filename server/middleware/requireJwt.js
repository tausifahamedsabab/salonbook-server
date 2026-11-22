const jwt = require('jsonwebtoken');

/**
 * JWT verification middleware (Express backend).
 *
 * Verifies an HS256 Bearer token signed with JWT_SECRET and attaches
 * `req.user` ({ id, email, role, isBlocked }). Rejects missing or invalid
 * tokens with 401. For cookie-session clients, use `requireAuth` from
 * ./auth instead (it tries JWT first when an Authorization header exists).
 */
function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing Bearer token' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired JWT' });
  }
  const id = payload.sub || payload.id;
  if (!id) {
    return res.status(401).json({ success: false, error: 'JWT missing subject' });
  }
  req.user = {
    id,
    email: payload.email || null,
    role: payload.role || 'customer',
    isBlocked: Boolean(payload.isBlocked),
  };
  next();
}

module.exports = { requireJwt };
