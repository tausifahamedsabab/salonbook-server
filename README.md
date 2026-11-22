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
| `DNS_SERVERS` | **Local only** — comma-separated DNS servers for sandboxes that cannot resolve MongoDB SRV records; leave unset on Vercel |
| `RUN_SEED` | Set `true` for one deployment to seed admin/services; otherwise production cold starts skip seeding |
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

## Vercel Deployment (backend)

This repository is Vercel-ready with **zero build configuration**: `api/index.js` exports the Express app,
`vercel.json` rewrites every path to that function, and `engines.node` is `>=20`. Vercel runs `npm install`
automatically; no build command or output directory is needed.

1. Import `https://github.com/tausifahamedsabab/salonbook-server` at vercel.com/new and keep the repository
   root as the **Root Directory**. Leave Build Command and Output Directory empty.
2. In **Project Settings → Environment Variables**, add the variables from the table above for Production
   (and Preview if needed). Never commit values. Specifically:
   - `MONGODB_URI` — Atlas SRV connection string; allow Vercel egress (or `0.0.0.0/0`) in Atlas Network Access.
   - `BETTER_AUTH_SECRET` — a long random value; keep it stable across deployments or sessions invalidate.
   - `BETTER_AUTH_URL` — the public **backend** URL, e.g. `https://salonbook-server.vercel.app`.
   - `APP_URL` — the public **frontend** URL, e.g. `https://salonbook.vercel.app` (drives CORS, Better Auth
     trusted origins and Stripe redirects).
   - `AUTH_COOKIE_CROSS_SITE=true` when client and API are on different sites (sets SameSite=None; Secure).
     Prefer custom domains under one apex to avoid browsers blocking third-party cookies.
   - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ALLOW_ADMIN_REGISTRATION=false`, `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `IMGBB_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - `PORT` is injected by Vercel — do not set it. `STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_API_URL` are
     frontend-only variables.
3. **First deployment only — seed the admin and demo services.** Either set `RUN_SEED=true` for that one
   deployment, or run `npm run seed` locally with the same env values against the deployed Atlas database
   (preferred). Production cold starts skip seeding unless `RUN_SEED=true` is explicitly set; remove the
   flag and redeploy afterwards.
4. Stripe webhook: add `https://<BACKEND_URL>/api/webhooks/stripe` in test mode for `checkout.session.completed`,
   `checkout.session.expired` and `payment_intent.payment_failed`; copy its signing secret into
   `STRIPE_WEBHOOK_SECRET`. The route verifies the raw body before `express.json()` runs.
5. Google OAuth: register `https://<BACKEND_URL>/api/auth/callback/google` as an authorized redirect URI.
   Only set `GOOGLE_REDIRECT_URL` if you need to override the callback derived from `BETTER_AUTH_URL`.
6. Frontend project: set `NEXT_PUBLIC_API_URL=https://<BACKEND_URL>` and
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
7. Request size: Vercel Functions allow 4.5 MB per request by default. This API rejects bodies over 4 MB with
   a JSON 413 and caps image uploads at 3 MB. Keep image files small; for larger uploads enable Vercel's
   20 MiB beta (Pro + Performance 4 GB + `VERCEL_SUPPORT_LARGE_REQUEST_BODY=1`) and raise the limits in code.
8. Verify after deploy: `GET https://<BACKEND_URL>/health` → `{"success":true,"ok":true}`, sign in with the
   seeded admin, call `/api/admin/stats`, then run a Stripe test payment and confirm the webhook marks it paid.
9. Local development is unchanged: `npm install`, fill `.env`, `npm start`. `app.listen()` is guarded by
   `require.main === module`, so importing the app in Vercel never starts a local listener. `vercel dev`
   (CLI ≥ 47) can be used to exercise the serverless shape locally.

Other Node hosts (Render/Railway/Fly) still work with `npm start` and `PORT`.
