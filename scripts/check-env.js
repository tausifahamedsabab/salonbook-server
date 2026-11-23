require("dotenv/config");

// Preflight check for deployment configuration. Prints variable NAMES only —
// never values — so it is safe to run in CI or paste output into an issue.
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";

const checks = [
  { name: "MONGODB_URI", required: true },
  { name: "JWT_SECRET", required: true, minLength: 16 },
  // Optional on Vercel: auth.js derives a secret from JWT_SECRET and resolves
  // the backend URL from VERCEL_URL / the request host when these are absent.
  { name: "BETTER_AUTH_SECRET", required: false, minLength: 32, warnInProduction: true },
  { name: "BETTER_AUTH_URL", required: false, url: true, warnInProduction: true },
  { name: "APP_URL", required: production, url: true },
  { name: "ADMIN_EMAIL", required: true },
  { name: "ADMIN_PASSWORD", required: true },
  { name: "STRIPE_SECRET_KEY", required: production },
  { name: "STRIPE_WEBHOOK_SECRET", required: production },
  { name: "GOOGLE_CLIENT_ID", required: false },
  { name: "GOOGLE_CLIENT_SECRET", required: false },
];

function isUrl(value) {
  try {
    const parsed = new URL(value.trim().replace(/\/+$/, ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

let failures = 0;
console.log(
  `SalonBook server env check (${production ? "production" : "development"})`,
);

for (const check of checks) {
  const raw = process.env[check.name];
  const value = typeof raw === "string" ? raw.trim() : "";
  const requiredSuffix = check.required ? "required" : "optional";

  if (!value) {
    if (check.required) {
      failures += 1;
      console.log(`  FAIL  ${check.name.padEnd(24)} missing (${requiredSuffix})`);
    } else {
      const label = production && check.warnInProduction ? "WARN" : "SKIP";
      console.log(`  ${label}  ${check.name.padEnd(24)} not set (${requiredSuffix})`);
    }
    continue;
  }

  const problems = [];
  if (check.minLength && value.length < check.minLength) {
    problems.push(`must be at least ${check.minLength} characters`);
  }
  if (check.url && !isUrl(value)) {
    problems.push("must be a valid http(s) URL");
  }

  if (problems.length) {
    failures += 1;
    console.log(`  FAIL  ${check.name.padEnd(24)} ${problems.join("; ")}`);
  } else {
    console.log(`  PASS  ${check.name.padEnd(24)} set`);
  }
}

if (process.env.BETTER_AUTH_URL && process.env.APP_URL) {
  const authUrl = process.env.BETTER_AUTH_URL.trim().replace(/\/+$/, "");
  const appUrl = process.env.APP_URL.trim().replace(/\/+$/, "");
  if (authUrl === appUrl) {
    failures += 1;
    console.log(
      "  FAIL  BETTER_AUTH_URL          must be the BACKEND URL, not APP_URL (frontend)",
    );
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found. Fix them before deploying.`);
  process.exit(1);
}
console.log("\nAll required variables look valid.");
