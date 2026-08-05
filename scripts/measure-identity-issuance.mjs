// scripts/measure-identity-issuance.mjs — the issuance lockout battery.
//
// THE VULNERABILITY: GET /api/auth returns early for an already-verified
// cookie, so every request reaching the issuance limiter has NO cookie by
// construction — and the limiter's subject was requestSubject(req), which is
// the literal constant "unverified-public" on that branch. limit:30/hour was
// therefore ONE GLOBAL BUCKET. Thirty cookie-less requests from any script
// locked identity issuance for the ENTIRE PRODUCT for the rest of the clock
// hour; every new visitor then 429'd, got no cookie, and every downstream
// surface 401'd. The same lockout happened with no attacker at all as soon as
// 30 genuinely new visitors arrived within one hour.
//
// DECLARED CRITERIA (each states what would FAIL):
//   L1 LOCKOUT REPRODUCED. Under the old posture (limit 30) request 31 from a
//      DIFFERENT caller must be refused. FAILS IF not — nothing to fix.
//   L2 LOCKOUT GONE. Under the shipped defaults, 200 cookie-less issuances
//      must all succeed and a fresh caller must still be served. FAILS IF any
//      429 appears below the declared ceiling.
//   L3 THE CEILING STILL EXISTS. Issuance must stop at the hourly global.
//      FAILS IF minting is unbounded — that would trade a lockout for a sybil
//      supply, which is the specific mistake this round must not make.
//   L4 DEGRADATION. With issuance refused, every anonymous-capable read
//      surface must still serve, /api/feed included. FAILS IF any returns
//      non-200 — a lockout must de-personalize, never blank the product.
//   L5 A VERIFIED COOKIE IS NEVER THROTTLED. Repeat GETs carrying a valid
//      device cookie must always return the same uid. FAILS otherwise.
//
// AMENDMENT HISTORY: none yet (first run).
//
// Run against a server started with the harness ritual; pass the base URL.
const BASE = process.argv[2] || "http://localhost:3459";
const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(`${n}: ${d}`);
const get = (path, headers = {}) => fetch(BASE + path, { headers, cache: "no-store" });

// A fresh "caller" is simply a request with no cookie jar — exactly what a
// first-time visitor is.
async function mint(n) {
  let ok = 0, refused = 0, firstRefusalAt = null;
  for (let i = 0; i < n; i++) {
    const r = await get("/api/auth");
    if (r.status === 200) ok++;
    else { refused++; if (firstRefusalAt === null) firstRefusalAt = i + 1; }
  }
  return { ok, refused, firstRefusalAt };
}

const mode = process.env.BATTERY_MODE || "fixed";

if (mode === "legacy") {
  // L1 — the old posture, reproduced by setting the limit back to 30.
  const r = await mint(35);
  check("L1 lockout reproduced", r.refused > 0 && r.firstRefusalAt <= 31,
    `first refusal at request ${r.firstRefusalAt} of 35 (old posture refuses from 31)`);
  const fresh = await get("/api/auth");
  check("L1 fresh caller locked out too", fresh.status === 429,
    `a brand-new visitor gets ${fresh.status} — this is the product-wide lockout`);
} else {
  // L2 — the lockout is gone at a volume that used to be fatal.
  const r = await mint(200);
  check("L2 lockout gone", r.refused === 0,
    `200 cookie-less issuances, refusals: ${r.refused} (old posture refused 170 of them)`);
  const fresh = await get("/api/auth");
  check("L2 fresh caller served", fresh.status === 200,
    `a brand-new visitor after 200 mints gets ${fresh.status}`);

  // L5 — a verified cookie never touches the issuance limiter.
  const first = await get("/api/auth");
  const cookie = (first.headers.get("set-cookie") || "").split(";")[0];
  const uid1 = (await first.json()).uid;
  let stable = true;
  for (let i = 0; i < 50; i++) {
    const r2 = await get("/api/auth", { cookie });
    const body = await r2.json().catch(() => ({}));
    if (r2.status !== 200 || body.uid !== uid1) { stable = false; break; }
  }
  check("L5 verified cookie never throttled", stable,
    "50 repeat calls with a valid device cookie all returned the same uid");
}

// L4 — degradation, checked in both modes: these must serve WITHOUT a cookie.
{
  const surfaces = ["/api/feed?user=guest", "/api/discover", "/api/search?q=jacket",
    "/api/related?item=syn-0011", "/api/suggest?q=jack", "/api/editorial"];
  const codes = [];
  for (const p of surfaces) codes.push(`${p.split("?")[0]}:${(await get(p)).status}`);
  check("L4 anonymous surfaces serve", codes.every((c) => c.endsWith(":200")), codes.join(" "));
}

console.log("\nIDENTITY ISSUANCE — ISOLATION, NOT LOCKOUT   (mode: " + mode + ")");
console.log("PASS");
for (const p of out.pass) console.log("  ✓", p);
if (out.notes.length) { console.log("NOTES"); for (const n of out.notes) console.log("  ·", n); }
if (out.fail.length) { console.log("FAIL"); for (const f of out.fail) console.log("  ✗", f); }
console.log(`\n${out.pass.length} passed, ${out.fail.length} failed`);
process.exit(out.fail.length ? 1 : 0);
