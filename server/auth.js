const { MongoClient } = require("mongodb");

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
const betterAuthUrl = process.env.BETTER_AUTH_URL || appUrl;

function assertAuthConfig() {
  if (isProduction && !betterAuthSecret) {
    throw new Error("[auth] BETTER_AUTH_SECRET must be set in production");
  }
  if (isProduction && !betterAuthUrl) {
    throw new Error(
      "[auth] BETTER_AUTH_URL (or APP_URL) must be set in production",
    );
  }
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

async function getAuth() {
  if (!auth) {
    assertAuthConfig();
    const { betterAuth, mongodbAdapter } = await loadBetterAuthModules();
    const dbClient = ensureClient();
    const dbName = process.env.MONGODB_DB_NAME || "salonbook";

    auth = betterAuth({
      secret: betterAuthSecret || undefined,
      baseURL: betterAuthUrl || undefined,
      database: mongodbAdapter(dbClient.db(dbName), { transaction: false }),
      trustedOrigins: authOrigins(),
      advanced:
        (process.env.AUTH_COOKIE_CROSS_SITE || "").toLowerCase() === "true"
          ? { defaultCookieAttributes: { sameSite: "none", secure: true } }
          : {},
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
          role: { type: "string", default: "customer", required: false },
          isBlocked: { type: "boolean", default: false, required: false },
        },
      },
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

module.exports = { getAuth, connectAuth, client: () => client };
