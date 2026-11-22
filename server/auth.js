const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { betterAuth } = require('better-auth');
const { mongodbAdapter } = require('better-auth/adapters/mongodb');

let auth = null;
let client = null;

// Harden the admin role: only the configured ADMIN_EMAIL may hold role 'admin'.
// Public sign-up (sign-up.mjs) and profile updates (update-user.mjs) copy the
// caller-supplied role into user records; the databaseHooks below strip the
// admin role on both paths. Reopen by setting ALLOW_ADMIN_REGISTRATION=true.
const ADMIN_REGISTRATION_ALLOWED = (process.env.ALLOW_ADMIN_REGISTRATION || '').toLowerCase() === 'true';
const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();

const isProduction = process.env.NODE_ENV === 'production';
const appUrl = process.env.APP_URL;
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
const betterAuthUrl = process.env.BETTER_AUTH_URL || appUrl;

function assertAuthConfig() {
  if (isProduction && !betterAuthSecret) {
    throw new Error('[auth] BETTER_AUTH_SECRET must be set in production');
  }
  if (isProduction && !betterAuthUrl) {
    throw new Error('[auth] BETTER_AUTH_URL (or APP_URL) must be set in production');
  }
}

function authOrigins() {
  const origins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  if (appUrl && !origins.includes(appUrl)) origins.push(appUrl);
  return origins;
}

function adminRoleGuard(user, context) {
  if (user?.role !== 'admin' || ADMIN_REGISTRATION_ALLOWED) return undefined;
  const emails = [];
  if (typeof user.email === 'string') emails.push(user.email.toLowerCase());
  const sessionEmail = context?.context?.session?.user?.email;
  if (typeof sessionEmail === 'string') emails.push(sessionEmail.toLowerCase());
  // NOTE: must return undefined (not null) — Better Auth's with-hooks uses
  // `"data" in result`, which throws on null.
  if (adminEmail && emails.includes(adminEmail)) return undefined;
  return { data: { ...user, role: 'customer' } };
}

/**
 * Creates the Better Auth instance. Call after MongoDB is connected.
 * Uses the root mongodb driver for the adapter (single bson version).
 */
function getAuth() {
  if (!auth) {
    assertAuthConfig();
    client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salonbook');
    client.connect().then(() => console.log('[auth] Better Auth MongoDB client connected'));
    auth = betterAuth({
      secret: betterAuthSecret || undefined,
      baseURL: betterAuthUrl || undefined,
      database: mongodbAdapter(client.db('salonbook'), { transaction: false }),
      trustedOrigins: authOrigins(),
      // When the deployed client and API live on different sites, cookies must
      // be SameSite=None; Secure for cross-site XHR to carry the session.
      advanced: (process.env.AUTH_COOKIE_CROSS_SITE || '').toLowerCase() === 'true'
        ? { defaultCookieAttributes: { sameSite: 'none', secure: true } }
        : {},
      emailAndPassword: {
        enabled: true,
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          ...(process.env.GOOGLE_REDIRECT_URL ? { redirectURL: process.env.GOOGLE_REDIRECT_URL } : {}),
        },
      },
      account: {
        accountLinking: {
          // Allow Google sign-in to link to accounts created via email sign-up.
          // Google returns a verified email, so skip the local-verification requirement.
          enabled: true,
          trustedProviders: ['google'],
          requireLocalEmailVerified: false,
        },
      },
      user: {
        // Every user is a customer; admins are seeded from ADMIN_EMAIL/ADMIN_PASSWORD.
        additionalFields: {
          role: { type: 'string', default: 'customer', required: false },
          isBlocked: { type: 'boolean', default: false, required: false },
        },
      },
      // Admin role is only assignable to the configured ADMIN_EMAIL (seed path);
      // public sign-up and profile updates can no longer promote anyone to admin.
      databaseHooks: {
        user: {
          create: { before: (user, context) => adminRoleGuard(user, context) },
          update: { before: (user, context) => adminRoleGuard(user, context) },
        },
      },
    });
  }
  return auth;
}

module.exports = { getAuth, client: () => client };
