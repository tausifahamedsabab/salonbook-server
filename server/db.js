const mongoose = require('mongoose');

// This sandbox lacks working system DNS for c-ares (driver resolver). Pin the
// global c-ares servers to 8.8.8.8/8.8.4.4 so SRV lookups succeed.
try {
  require('dns').promises.setServers(['8.8.8.8', '8.8.4.4']);
} catch { /* ignore */ }

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salonbook';

async function connectDB() {
  if (mongoose.connection.readyState !== 0) return; // Already connected
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`[db] Connected to MongoDB at ${uri}`);
  } catch (err) {
    console.error(`[db] Could not connect to MongoDB at ${uri}: ${err.message}`);
    throw err;
  }
}

module.exports = { connectDB };
