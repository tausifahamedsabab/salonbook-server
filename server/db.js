const mongoose = require('mongoose');

// OPTIONAL, LOCAL ONLY: some sandboxes cannot resolve MongoDB SRV records with
// their default resolver. Set DNS_SERVERS in the local .env to enable this.
// It is deliberately NOT set on Vercel, so serverless DNS resolution is untouched.
if (process.env.DNS_SERVERS) {
  try {
    const servers = process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
    if (servers.length) require('dns').promises.setServers(servers);
  } catch { /* ignore invalid values */ }
}

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salonbook';

// Cache one connection promise so concurrent invocations in the same warm
// serverless instance never open duplicate connection pools. A failed attempt
// clears the cache so the next invocation can retry.
let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: process.env.NODE_ENV === 'production' ? 5 : 10,
      })
      .then(() => {
        // Never log the URI: it contains MongoDB credentials.
        console.log('[db] MongoDB connected');
        return mongoose.connection;
      })
      .catch((err) => {
        connectionPromise = null;
        throw err;
      });
  }
  await connectionPromise;
  return mongoose.connection;
}

module.exports = { connectDB };
