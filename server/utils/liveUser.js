const mongoose = require('mongoose');

/**
 * Fetch the current `user` document for an authenticated principal.
 * Used by requireAuth to re-check role/blocked state on every request, so a
 * stale or tampered JWT claim can never grant access after the account changes.
 */
async function findLiveUser(id) {
  if (!id) return null;
  const col = mongoose.connection.db.collection('user');
  const raw = String(id);
  const queries = [];
  try {
    queries.push({ _id: new mongoose.Types.ObjectId(raw) });
  } catch {
    // Not an ObjectId — fall through to string lookups below.
  }
  queries.push({ _id: raw }, { id: raw });

  for (const query of queries) {
    const doc = await col.findOne(query).catch(() => null);
    if (doc) return doc;
  }
  return null;
}

module.exports = { findLiveUser };
