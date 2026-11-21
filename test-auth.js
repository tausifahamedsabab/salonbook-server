const BASE = "http://127.0.0.1:5000";
const HEADERS = { "content-type": "application/json", origin: "http://localhost:3000" };
async function main() {
  let r = await fetch(BASE + "/api/auth/sign-up/email", { method: "POST", headers: HEADERS, body: JSON.stringify({ name: "Test User", email: "cust-" + Date.now() + "@example.com", password: "password123", role: "customer" }) });
  console.log("sign-up:", r.status, (await r.text()).slice(0, 120));
  r = await fetch(BASE + "/api/auth/sign-in/email", { method: "POST", headers: HEADERS, body: JSON.stringify({ email: "admin@example.com", password: "adminsaloonbook1" }) });
  console.log("sign-in:", r.status);
  const setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  console.log("set-cookie names:", setCookies.map((c) => c.split("=")[0]));
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
  r = await fetch(BASE + "/api/auth/get-session", { method: "GET", headers: { origin: "http://localhost:3000", cookie: cookieHeader } });
  const session = await r.json().catch(() => null);
  console.log("get-session:", r.status, session && session.user ? JSON.stringify({ id: session.user.id, email: session.user.email, role: session.user.role }) : session);
  r = await fetch(BASE + "/api/services", { headers: { cookie: cookieHeader } });
  const services = await r.json();
  console.log("GET /api/services:", r.status, services.success ? "services=" + services.services.length : services);
  r = await fetch(BASE + "/api/customers", { headers: { cookie: cookieHeader } });
  const customers = await r.json();
  console.log("GET /api/customers:", r.status, customers.success ? "OK count=" + customers.customers.length : (await Promise.resolve(customers)));
}
main().catch((e) => { console.error(e); process.exit(1); });
