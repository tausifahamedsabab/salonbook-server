const { MongoClient } = require("mongodb");
const crypto = require("crypto");

let auth = null;
let betterAuthModPromise = null;
let client = null;
let clientPromise = null;

function loadBetterAuthModules() {
  if (!betterAuthModPromise) {
    betterAuthModPromise = Promise.all([
      import("better-auth"),
      import("better-auth/adapters/mongodb"),
    ]).then(([authMod, adapterMod]) => ({
      betterAuth: authMod.betterAuth,
      mongodbAdapter: adapterMod.mongodbAdapter,
    }));
  }
  return betterAuthModPromise;
}

function ensureClient() {
  if (!client) {
    client = new MongoClient(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/salonbook",
    );
  }
  return client;
}

async function connectAuth() {
  if (!clientPromise) {
    clientPromise = ensureClient()
      .connect()
      .then(() => {
        console.log("[auth] Better Auth MongoDB client connected");
        return client;
      })
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  await clientPromise;
  return client;
}

const ADMIN_REGISTRATION_ALLOWED =
  (process.env.ALLOW_ADMIN_REGISTRATION || "").toLowerCase() === "true";
const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();

const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.APP_URL;
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;

// Normalize once at startup: stray whitespace or a trailing slash makes Better
// Auth build malformed callback/session URLs, which surfaces as an opaque 500.
// IMPORTANT: this is the BACKEND URL. Falling back to APP_URL (the frontend)
// would point OAuth at the frontend's non-existent /api/auth/callback/google.
function normalizeBaseUrl(raw, label) {
  if (typeof raw !== "string" || !raw.trim()) {
    return { value: undefined, error: null };
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { value: undefined, error: `${label} must use http or https` };
    }
    if (parsed.username || parsed.password) {
      return { value: undefined, error: `${label} must not contain credentials` };
    }
    return { value: trimmed, error: null };
  } catch {
    return { value: undefined, error: `${label} must be a valid absolute URL` };
  }
}

// Vercel exposes the backend deployment hostname as VERCEL_URL. Use it before
// any dynamic resolution so callbacks/sessions have a stable HTTPS origin.
const vercelBaseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, "")}`
  : undefined;
const normalizedAuthUrl = normalizeBaseUrl(process.env.BETTER_AUTH_URL, "BETTER_AUTH_URL");
const betterAuthUrl = normalizedAuthUrl.value || vercelBaseUrl;

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// Last resort when neither BETTER_AUTH_URL nor VERCEL_URL exists: let Better
// Auth derive the origin from x-forwarded-host, but only for known hosts.
const dynamicBaseUrl = {
  allowedHosts: Array.from(
    new Set(
      [
        "localhost",
        "127.0.0.1",
        hostnameOf(appUrl),
        process.env.VERCEL_URL,
        "*.vercel.app",
      ].filter(Boolean),
    ),
  ),
  protocol: isProduction ? "https" : "auto",
  fallback: vercelBaseUrl || appUrl || "http://localhost:5000",
};

// Better Auth's built-in fallback secret is public. Derive a stable one from
// JWT_SECRET when BETTER_AUTH_SECRET is absent so sessions survive cold starts.
function deriveSecret() {
  if (!process.env.JWT_SECRET) return undefined;
  return crypto
    .createHash("sha256")
    .update(`salonbook-better-auth:${process.env.JWT_SECRET}`)
    .digest("hex");
}
const authSecret = betterAuthSecret?.trim() || deriveSecret();

/**
 * Names-only view of the auth configuration. Missing vars are now warnings —
 * fallbacks above keep /api/auth/get-session working in production. Values are
 * never exposed.
 */
function authConfigStatus() {
  const missing = [];
  const issues = [];

  if (!betterAuthSecret || !betterAuthSecret.trim()) {
    missing.push("BETTER_AUTH_SECRET not set (using JWT_SECRET-derived fallback)");
  } else if (betterAuthSecret.trim().length < 32) {
    missing.push("BETTER_AUTH_SECRET is shorter than 32 characters");
  }

  if (!process.env.BETTER_AUTH_URL || !process.env.BETTER_AUTH_URL.trim()) {
    missing.push(
      vercelBaseUrl
        ? "BETTER_AUTH_URL not set (using VERCEL_URL fallback)"
        : "BETTER_AUTH_URL not set (using dynamic baseURL fallback)",
    );
  } else if (!normalizedAuthUrl.value) {
    missing.push(normalizedAuthUrl.error || "BETTER_AUTH_URL must be a valid absolute URL");
  }

  return { ok: true, missing, issues };
}

function isAuthConfigError(err) {
  return Boolean(err && err.name === "AuthConfigError");
}

function assertAuthConfig() {
  // Kept for callers that still invoke it; fallbacks make it a no-op so a
  // missing deployment variable can never turn into a 500 on an auth route.
  return;
}

function authOrigins() {
  const origins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  if (appUrl && !origins.includes(appUrl)) origins.push(appUrl);
  return origins;
}

function adminRoleGuard(user, context) {
  if (user?.role !== "admin" || ADMIN_REGISTRATION_ALLOWED) return undefined;
  const emails = [];
  if (typeof user.email === "string") emails.push(user.email.toLowerCase());
  const sessionEmail = context?.context?.session?.user?.email;
  if (typeof sessionEmail === "string") emails.push(sessionEmail.toLowerCase());
  if (adminEmail && emails.includes(adminEmail)) return undefined;
  return { data: { ...user, role: "customer" } };
}

// `input: false` hides fields from Better Auth's session output too, which
// breaks client-side role routing. Keep the fields visible and protect them
// here instead: never let Better Auth update-user change the blocked flag.
async function userUpdateGuard(user, context) {
  const roleResult = adminRoleGuard(user, context);
  const data = roleResult ? { ...user, ...roleResult.data } : { ...user };
  const hasBlocked = Object.prototype.hasOwnProperty.call(user, "isBlocked");
  if (!roleResult && !hasBlocked) return undefined;

  if (hasBlocked) {
    const userId = context?.context?.session?.user?.id;
    let blocked = false;
    if (userId) {
      try {
        const existing = await client
          .db(process.env.MONGODB_DB_NAME || "salonbook")
          .collection("user")
          .findOne({ id: userId });
        blocked = Boolean(existing?.isBlocked);
      } catch {
        blocked = false;
      }
    }
    data.isBlocked = blocked;
  }
  return { data };
}

async function getAuth() {
  if (!auth) {
    assertAuthConfig();
    const { betterAuth, mongodbAdapter } = await loadBetterAuthModules();
    const dbClient = ensureClient();
    const dbName = process.env.MONGODB_DB_NAME || "salonbook";

    auth = betterAuth({
      secret: authSecret,
      baseURL: betterAuthUrl || dynamicBaseUrl,
      database: mongodbAdapter(dbClient.db(dbName), { transaction: false }),
      trustedOrigins: authOrigins(),
      advanced: {
        // Required for the dynamic baseURL to honour Vercel's x-forwarded-host.
        trustedProxyHeaders: true,
        ...((process.env.AUTH_COOKIE_CROSS_SITE || "").toLowerCase() === "true"
          ? { defaultCookieAttributes: { sameSite: "none", secure: true } }
          : {}),
      },
      emailAndPassword: {
        enabled: true,
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          ...(process.env.GOOGLE_REDIRECT_URL
            ? { redirectURL: process.env.GOOGLE_REDIRECT_URL }
            : {}),
        },
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ["google"],
          requireLocalEmailVerified: false,
        },
      },
      user: {
        additionalFields: {
          // Visible in sessions so client role routing works. Write access is
          // restricted by the database hooks below and by middleware live-user checks.
          role: { type: "string", defaultValue: "customer", required: false },
          isBlocked: { type: "boolean", defaultValue: false, required: false },
        },
      },
      databaseHooks: {
        user: {
          create: { before: (user, context) => adminRoleGuard(user, context) },
          update: { before: (user, context) => userUpdateGuard(user, context) },
        },
      },
    });
  }
  return auth;
}

module.exports = {
  getAuth,
  connectAuth,
  client: () => client,
  authConfigStatus,
  isAuthConfigError,
};
