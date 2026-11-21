const { getAuth } = require('../auth');

async function requireAuth(req, res, next) {
  const auth = getAuth();
  try {
    const result = await auth.api.getSession({ headers: new Headers(req.headers) });
    if (!result || !result.user) {
      return res.status(401).json({ success: false, error: 'Please authenticate to continue' });
    }
    if (result.user.blocked) {
      return res.status(403).json({ success: false, error: 'This account is blocked' });
    }
    req.user = result.user;
    next();
  } catch (err) {
    console.error('[auth] getSession failed:', err && err.message ? err.message : err);
    return res.status(401).json({ success: false, error: 'Authentication error' });
  }
}

function requireRole(role) {
  return async (req, res, next) => {
    // Users without a stored role are customers (the additionalFields default).
    const userRole = req.user ? (req.user.role || 'customer') : null;
    if (!req.user || userRole !== role) {
      return res.status(403).json({ success: false, error: `This action requires the ${role} role` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
