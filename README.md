# SalonBook Server — REST API

Express backend for SalonBook: authentication (Better Auth + JWT), services, appointments, Stripe payments,
customer management and admin statistics, backed by MongoDB.

## Important Features

- **Authentication**: Better Auth email/password and Google sign-in with HTTP-only session cookies;
  JWT Bearer verification middleware for machine clients; server-side `requireAuth` / `requireRole` guards;
  blocked users receive 403; public sign-up can never create an admin.
- **Services**: public active-only listing, search by name, category filter and price sorting; admin CRUD with
  ImgBB image uploads and active/inactive status.
- **Appointments**: customer-only booking with predefined time slots, duplicate booking conflict detection,
  status `pending → confirmed | cancelled`, payment status `unpaid | paid`.
- **Payments**: Stripe Checkout for confirmed unpaid appointments; a verified webhook writes the transaction
  and marks the appointment paid (idempotently); no manual endpoint can mark a payment successful.
- **Admin**: dashboard statistics, manage services/appointments/customers (block/unblock), read-only transactions.
- **Startup**: dotenv-based configuration and one-time admin seeding from environment variables.

## Technology Stack

- Node.js + Express.js 5
- MongoDB (native driver for Better Auth, Mongoose for application models)
- Better Auth, `jsonwebtoken`, Stripe, ImgBB, Google OAuth
- CORS with credentialed origins, raw-body Stripe webhook verification

## Installation Instructions

```bash
cd salonbook-server
npm install
cp .env.example .env   # then fill in real values locally
```

Requires Node.js ≥ 20 and a reachable MongoDB instance. Never commit `.env`.

## How to Run the Project Locally

1. Make sure MongoDB is running (the client repo has `npm run mongo` for an in-memory instance).
2. Set `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and the other variables in `.env`.
3. Start the API: `npm start` (or `npm run dev`) — it listens on `http://127.0.0.1:5000` by default.
4. Check `GET /health`, then run the frontend on port 3000 (`npm run dev` in the client repo).
5. The first start seeds the admin account and demo services (only when the collections are empty).

## Required Environment Variables (names only — never commit values)

| Variable | Purpose |
| --- | --- |
| `PORT` | API listen port (default 5000) |
| `MONGODB_URI` | MongoDB Atlas/local connection string |
| `JWT_SECRET` | Secret for signing/verifying JWTs |
| `BETTER_AUTH_SECRET` | Better Auth secret (required in production) |
| `BETTER_AUTH_URL` | Backend public URL (required in production; falls back to `APP_URL`) |
| `APP_URL` | Frontend public URL: CORS origin, Better Auth trusted origin, Stripe redirect base |
| `AUTH_COOKIE_CROSS_SITE` | `true` for cross-site deployments (SameSite=None; Secure cookies) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | One-time seeded administrator credentials |
| `ALLOW_ADMIN_REGISTRATION` | Keep `false`; admin role cannot be self-assigned through sign-up/profile updates |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Checkout API and webhook signature verification |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `IMGBB_API_KEY` | Service image uploads |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` | Google OAuth provider |

## Live Website Link

_Live URL to be added here after deployment._

## Client and Server Repository Links

- Client: https://github.com/tausifahamedsabab/salonbook
- Server: https://github.com/tausifahamedsabab/salonbook-server

## Deployment Guideline

1. Deploy behind HTTPS on a Node host (Render/Railway/Fly/etc.); expose `PORT` and the `/health` route.
2. Set every variable above in the host's environment dashboard — never in source control.
3. Set `APP_URL` to the deployed client origin. CORS and Better Auth `trustedOrigins` are built from it
   (plus localhost for development). Set `BETTER_AUTH_URL` to the deployed API URL and generate a strong
   `BETTER_AUTH_SECRET`. If the client and API are on different sites, set `AUTH_COOKIE_CROSS_SITE=true`.
4. Stripe: register `https://<api-host>/api/webhooks/stripe` in test mode, subscribe to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `payment_intent.payment_failed`,
   and copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`.
5. Google: add `https://<api-host>/api/auth/callback/google` to the OAuth client's redirect URIs.
6. MongoDB Atlas: allow the deploy host's egress IP and use the SRV connection string in `MONGODB_URI`.
7. Smoke-test the live API: `/health`, admin sign-in, admin stats, customer booking, Stripe test checkout and
   webhook, then verify a private-route refresh in the frontend.
