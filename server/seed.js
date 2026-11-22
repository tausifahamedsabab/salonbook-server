const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Service = require('./models/Service');
const { getAuth } = require('./auth');

async function seed() {
  const auth = getAuth();
  const users = mongoose.connection.db.collection('user');
  const services = mongoose.connection.db.collection('services');

  // Bootstrap admin from environment (created once via Better Auth).
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await users.findOne({ email: adminEmail.toLowerCase() });
    const isBetterAuthUser = Boolean(existing && existing.password);
    // Delete legacy users (old schema) so Better Auth can create the admin cleanly.
    if (existing && !isBetterAuthUser) {
      await users.deleteOne({ _id: existing._id });
    }
    if (!isBetterAuthUser) {
      try {
        await auth.api.signUpEmail({
          body: {
            name: process.env.ADMIN_NAME || 'Admin',
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
          },
        });
        console.log('[seed] Admin user created:', adminEmail);
      } catch (err) {
        console.error('[seed] Failed to create admin user:', err && err.message ? err.message : err);
      }
    } else {
      console.log('[seed] Admin user already exists:', adminEmail);
    }
  }

  // Demo services when the catalog is empty (the Service model manages the 'services' collection).
  if ((await Service.countDocuments()) === 0) {
    await Service.create([
      { name: 'Haircut & Styling', description: "Classic men's and women's haircuts, trims and styling.", category: 'Haircut & Styling', price: 8500, durationMinutes: 45 },
      { name: 'Hair Coloring', description: 'From subtle shades to bold statement colors, applied professionally.', category: 'Hair Coloring', price: 12000, durationMinutes: 90 },
      { name: 'Hair Treatment', description: 'Deep-conditioning treatments for healthy, shiny, voluminous hair.', category: 'Hair Treatment', price: 7500, durationMinutes: 60 },
      { name: 'Facial & Skincare', description: 'Deep-cleansing, exfoliating, hydrating and anti-aging facial treatment.', category: 'Facial & Skincare', price: 6500, durationMinutes: 60 },
      { name: 'Makeup', description: 'Professional makeup application, daily makeup, bridal and wedding looks.', category: 'Makeup', price: 25000, durationMinutes: 120 },
      { name: 'Manicure & Pedicure', description: 'Classic and gel manicures, pedicures, and nail art.', category: 'Manicure & Pedicure', price: 5500, durationMinutes: 60 },
      { name: 'Spa & Massage', description: 'Full-body and facial massages with aromatherapy oils and hot stones.', category: 'Spa & Massage', price: 9000, durationMinutes: 75 },
    ]);
    console.log('[seed] Seeded demo services');
  }

  const [userCount, serviceCount] = await Promise.all([users.countDocuments(), Service.countDocuments()]);
  console.log(`[seed] Users: ${userCount}, Services: ${serviceCount}`);
}

module.exports = { seed };
