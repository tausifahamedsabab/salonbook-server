require("dotenv/config");
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a reverse proxy (HTTPS termination), let Express honour X-Forwarded-*.
app.set("trust proxy", 1);

// Credentialed CORS is restricted to the configured client origin(s).
const clientOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
if (process.env.APP_URL && !clientOrigins.includes(process.env.APP_URL)) {
  clientOrigins.push(process.env.APP_URL);
}
app.use(cors({ origin: clientOrigins, credentials: true }));

// One-time readiness per warm instance: database connections and (opt-in)
// seeding. Cached so concurrent serverless invocations share a single setup.
let readyPromise = null;
async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await connectDB();
      const { connectAuth, authConfigStatus } = require("./auth");
      await connectAuth();
      // Surface auth misconfiguration on cold start instead of hiding it behind
      // a generic 500 on the first /api/auth/* request.
      const authStatus = authConfigStatus();
      if (!authStatus.ok) {
        console.error(
          `[auth] Misconfigured: ${authStatus.issues.join("; ")}`,
        );
      }
      if (authStatus.missing.length) {
        console.warn(`[auth] Fallbacks in use: ${authStatus.missing.join("; ")}`);
      }
      // Seeding is a startup/deployment task, not a per-cold-start side effect.
      // Local `npm start` keeps seeding as before; production requires RUN_SEED=true
      // (or run `npm run seed` once against the deployed database).
      if (
        process.env.NODE_ENV !== "production" ||
        process.env.RUN_SEED === "true"
      ) {
        const { seed } = require("./seed");
        await seed();
      }
    })().catch((err) => {
      readyPromise = null; // allow the next invocation to retry
      throw err;
    });
  }
  await readyPromise;
}

app.use((req, res, next) => {
  ensureReady().then(() => next(), next);
});

// Webhooks mount BEFORE express.json(): Stripe signature verification needs the
// raw request body, and body-parser would otherwise parse it to an object.
app.use("/api/webhooks", require("./routes/webhookRoutes"));

// Vercel Functions accept at most 4.5 MB per request by default, so Express
// rejects oversized JSON itself with a clear 413 rather than a platform error.
app.use(express.json({ limit: "4mb" }));

// Better Auth handles /api/auth/* (sign up, sign in, get session, sign out, ...).
// The handler is created on first use so importing this module never requires
// production auth env vars to be present at build time.
let authHandler = null;

async function getAuthHandler() {
  if (!authHandler) {
    const { getAuth } = require("./auth");
    const { toNodeHandler } = require("better-auth/node");
    const authInstance = await getAuth();
    authHandler = toNodeHandler(authInstance);
  }
  if (typeof authHandler !== "function") {
    throw new Error("Better Auth handler is not a function");
  }
  return authHandler;
}

app.all("/api/auth/*splat", async (req, res, next) => {
  try {
    const handler = await getAuthHandler();
    return handler(req, res, next);
  } catch (err) {
    const { isAuthConfigError, authConfigStatus } = require("./auth");
    if (isAuthConfigError(err)) {
      const status = authConfigStatus();
      console.error("[auth] Request rejected:", err.message);
      // Actionable signal instead of the generic 500 from the global handler.
      // Only variable NAMES are returned — never their values.
      return res.status(503).json({
        success: false,
        error: "Authentication is not configured on this server.",
        missing: status.missing,
        issues: status.issues,
      });
    }
    return next(err);
  }
});

app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/admin", require("./routes/adminStatsRoutes"));
app.use("/api/admin/transactions", require("./routes/transactionRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/users/profile", require("./routes/profileRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

app.get("/health", (req, res) => res.json({ success: true, ok: true }));

// Production-safe errors: clients never see internal messages or stacks.
app.use((err, req, res, next) => {
  const tooLarge = Boolean(
    err && (err.type === "entity.too.large" || err.code === "LIMIT_FILE_SIZE"),
  );
  const clientError = Boolean(err && err.status >= 400 && err.status < 500);
  const status = tooLarge ? 413 : clientError ? err.status : 500;
  if (status === 500) {
    console.error(
      "[server] Unhandled error:",
      err && err.stack ? err.stack : err,
    );
  }
  const message = tooLarge
    ? "Request body too large (maximum 4 MB)"
    : status === 500
      ? "Internal server error"
      : (err && err.message) || "Request failed";
  return res.status(status).json({ success: false, error: message });
});

app.use((req, res) => {
  return res.status(404).json({ success: false, error: "Not found" });
});

// Local development only. Vercel imports the exported app and never calls this.
async function startLocal() {
  await ensureReady();
  return app.listen(PORT, () => {
    console.log(`[server] REST API listening on http://127.0.0.1:${PORT}`);
  });
}

if (require.main === module) {
  startLocal().catch((err) => {
    console.error(
      "[server] Startup failed:",
      err && err.stack ? err.stack : err,
    );
    process.exit(1);
  });
}

module.exports = { app, ensureReady, startLocal };
