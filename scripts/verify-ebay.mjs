#!/usr/bin/env node
// scripts/verify-ebay.mjs — prove the eBay path end to end the moment keys
// exist, and say plainly what is still missing when they do not.
//
//   set -a; source .env.local; set +a
//   node scripts/verify-ebay.mjs ["search terms"]
//
// READ-ONLY. Talks to eBay's official Browse API and to nothing else: no
// database connection, no writes, no ingest. It answers one question —
// "would real garments with real photographs flow through this pipeline?" —
// and then stops.
//
// WHY THIS EXISTS. Every other blocker in the vision work is now cleared:
// lib/vision/embed.js can describe a photograph (r27), the gamma bridge can
// use that description (r27), product_images has a table, colorEvidence.js can
// reconcile merchant colour claims against real listing photos. All of it is
// dry for exactly one reason: the catalog's 915 items have img = null. This
// script is the check that the tap actually runs before anyone plumbs it in.
//
// CHECKS, in the order a failure would stop you:
//   E1  CREDENTIALS   — the two keys are present, and WHICH environment they
//                       point at. SANDBOX is the default and its listings are
//                       test fixtures, not real garments; the vision work
//                       needs PRODUCTION.
//   E2  APPROVAL GATE — EBAY_PARTNERSHIP_APPROVED, an attestation the OWNER
//                       makes, not a technical setting. Reported, never set
//                       here. The route refuses live access without it.
//   E3  OAUTH         — client-credentials token exchange actually succeeds.
//                       This is where a mistyped secret shows up.
//   E4  SEARCH        — a real query returns listings.
//   E5  IMAGES        — how many normalized items carry a usable image URL.
//                       THE NUMBER THIS WHOLE SCRIPT IS FOR: it is the input
//                       the image embedder has been waiting on.
//   E6  SCHEMA        — normalized items carry the fields the catalog needs
//                       (id, title, brand, price, tags) so they can go through
//                       the same pipeline as seed items rather than a special
//                       case.

const query = process.argv.slice(2).join(" ") || "wool overcoat";
const ok = (label, pass, detail) =>
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);

console.log(`eBay Browse API verification — query "${query}"\n`);

// ---- E1 credentials ---------------------------------------------------------
const id = process.env.EBAY_CLIENT_ID || "";
const secret = process.env.EBAY_CLIENT_SECRET || "";
const env = process.env.EBAY_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
const haveKeys = !!(id && secret);
// Never print a secret, not even partially: a key that reaches a terminal
// reaches a scrollback buffer and a screen share. Length is enough to tell
// "pasted" from "pasted wrong".
ok("E1 credentials present", haveKeys,
  haveKeys ? `client id ${id.length} chars, secret ${secret.length} chars, env ${env}`
           : "set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local");
if (!haveKeys) {
  console.log(`
Nothing further can be checked without them. To get them:
  1. developer.ebay.com -> sign in -> Application Keys
  2. take the PRODUCTION keyset (Sandbox listings are test fixtures, not
     real garments — they will not give the vision work anything to see)
  3. "App ID (Client ID)"  -> EBAY_CLIENT_ID
     "Cert ID (Client Secret)" -> EBAY_CLIENT_SECRET
  4. paste them into .env.local WITHOUT going through a chat window or a
     terminal echo — copy from the dashboard, then:
        printf 'EBAY_CLIENT_ID=%s\\n' "$(pbpaste)" >> .env.local
     and the same for the secret. Add EBAY_ENV=PRODUCTION.
`);
  process.exit(1);
}
if (env !== "PRODUCTION") {
  console.log("        note: EBAY_ENV is not PRODUCTION — sandbox listings are test");
  console.log("        fixtures with placeholder photos, which cannot feed the vision work.");
}

// ---- E2 approval gate -------------------------------------------------------
const approved = process.env.EBAY_PARTNERSHIP_APPROVED === "1";
ok("E2 partnership approval", approved,
  approved ? "EBAY_PARTNERSHIP_APPROVED=1"
           : "not set — /api/ebay stays 503. This is an OWNER attestation about " +
             "eBay's terms, not a technical switch, so this script reports it and " +
             "never sets it. Ingest below is unaffected; only the public route is gated.");

// ---- E3 OAuth ---------------------------------------------------------------
let token = null;
try {
  const { getAppToken } = await import("../lib/ingest/ebay.js");
  token = await getAppToken();
  ok("E3 oauth token", !!token, `client-credentials exchange succeeded (${env})`);
} catch (e) {
  ok("E3 oauth token", false, String(e.message || e).slice(0, 200));
  console.log(`
  A 401 here almost always means the secret was pasted with a trailing
  newline or a leading space, or that a SANDBOX keyset is being used against
  PRODUCTION hosts (or the reverse). The keys themselves are rarely wrong.
`);
  process.exit(1);
}

// ---- E4/E5/E6 a real search ------------------------------------------------
try {
  const { searchEbay } = await import("../lib/ingest/ebay.js");
  const { CATALOG } = await import("../lib/ingest/catalog.js");
  const knownIds = new Set(CATALOG.map((it) => it.id));
  const items = await searchEbay(query, { limit: 24, knownIds });

  ok("E4 search returns listings", items.length > 0, `${items.length} normalized items`);
  if (!items.length) process.exit(1);

  const withImages = items.filter((it) => typeof it.img === "string" && /^https?:/.test(it.img));
  const multi = items.filter((it) => Array.isArray(it.images) && it.images.length > 1);
  ok("E5 items carry photographs", withImages.length > 0,
    `${withImages.length}/${items.length} have an image URL; ${multi.length} have more than one`);

  const complete = items.filter((it) => it.id && it.title && it.price != null && it.tags && Object.keys(it.tags).length);
  ok("E6 catalog schema honoured", complete.length === items.length,
    `${complete.length}/${items.length} carry id + title + price + brain tags`);

  console.log("\nsample (first 3, image URLs shown as host only):");
  for (const it of items.slice(0, 3)) {
    const host = it.img ? new URL(it.img).host : "(no image)";
    console.log(`  ${String(it.brand || "—").padEnd(18)} ${String(it.title || "").slice(0, 46).padEnd(48)} ${String(it.price ?? "—").padStart(7)}  ${host}`);
    console.log(`     tags: ${Object.keys(it.tags || {}).slice(0, 6).join(", ") || "(none)"}`);
  }

  const ready = withImages.length > 0 && complete.length === items.length;
  console.log(`\nVERDICT: ${ready ? "READY" : "NOT READY"} — real garments with real photographs ${ready ? "DO" : "do NOT"} flow through this pipeline.`);
  if (ready) {
    console.log(`
Next, and only with your word — each is its own reviewed round:
  · ingest a bounded first batch into items + product_images
  · embed each photograph at a canonical size (lib/vision/embed.js) and store
    the vector with its version, per the r18 provenance rule
  · supply state.imageVectors on the feed route, at which point the gamma
    bridge starts contributing with no further ranking code
`);
  }
  process.exit(ready ? 0 : 1);
} catch (e) {
  ok("E4 search", false, String(e.message || e).slice(0, 300));
  process.exit(1);
}
