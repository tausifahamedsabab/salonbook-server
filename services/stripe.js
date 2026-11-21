const Stripe = require('stripe');

// The client is null when no key is configured (checkout then returns a clear error).
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

module.exports = { stripe };
