const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { betterAuth } = require('better-auth');
const { mongodbAdapter } = require('better-auth/adapters/mongodb');

let auth = null;
let client = null;

/**
 * Creates the Better Auth instance. Call after MongoDB is connected.
 * Uses the root mongodb driver for the adapter (single bson version).
 */
function getAuth() {
  if (!auth) {
    client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salonbook');
    client.connect().then(() => console.log('[auth] Better Auth MongoDB client connected'));
    auth = betterAuth({
      database: mongodbAdapter(client.db('salonbook'), { transaction: false }),
      trustedOrigins: ['http://localhost:3000'],
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
    });
  }
  return auth;
}

module.exports = { getAuth, client: () => client };
