const mongoose = require('mongoose');

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
