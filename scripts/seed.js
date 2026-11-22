// One-time database seeding for deployments: npm run seed
// Production cold starts skip seeding; run this explicitly after the first deploy.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { connectDB } = require('../server/db');
const { connectAuth } = require('../server/auth');
const { seed } = require('../server/seed');

(async () => {
  await connectDB();
  await connectAuth();
  await seed();
  console.log('[seed] complete');
  process.exit(0);
})().catch((err) => {
  console.error('[seed] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
