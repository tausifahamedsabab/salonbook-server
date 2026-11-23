const { getAuth } = require("../auth");
const { requireJwt } = require("./requireJwt");
const { findLiveUser } = require("../utils/liveUser");

// requireJwt is callback-style; promote it so both auth paths share the same
// live-account enforcement below.
function verifyJwt(req, res) {
  return new Promise((resolve, reject) => {
    requireJwt(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

async function requireAuth(req, res, next) {
  try {
    if (req.headers.authorization) {
      // Machine auth: Bearer JWT verified server-side against JWT_SECRET.
      await verifyJwt(req, res);
    } else {
      const auth = await getAuth();
      const result = await auth.api.getSession({
        headers: new Headers(req.headers),
      });
      if (!result || !result.user) {
        return res
          .status(401)
          .json({ success: false, error: "Please authenticate to continue" });
      }
      req.user = result.user;
    }

    // Re-read the account on every request. JWT payloads can be stale (or
    // forged), and Better Auth update-user must not be able to flip isBlocked.
    const live = await findLiveUser(req.user.id);
    if (!live) {
      return res
        .status(401)
        .json({ success: false, error: "Please authenticate to continue" });
    }
    if (live.isBlocked) {
      return res
        .status(403)
        .json({ success: false, error: "This account is blocked" });
    }
    req.user = {
      ...req.user,
      role: live.role || "customer",
      isBlocked: false,
      email: live.email || req.user.email || null,
    };
    return next();
  } catch (err) {
    const { isAuthConfigError, authConfigStatus } = require("../auth");
    if (isAuthConfigError(err)) {
      const status = authConfigStatus();
      console.error("[auth] Authentication failed:", err.message);
      return res.status(503).json({
        success: false,
        error: "Authentication is not configured on this server.",
        missing: status.missing,
        issues: status.issues,
      });
    }
    console.error(
      "[auth] Authentication failed:",
      err && err.message ? err.message : err,
    );
    return res
      .status(401)
      .json({ success: false, error: "Authentication error" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    // Users without a stored role are customers (the additionalFields default).
    const userRole = req.user ? req.user.role || "customer" : null;
    if (!req.user || userRole !== role) {
      return res.status(403).json({
        success: false,
        error: `This action requires the ${role} role`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
