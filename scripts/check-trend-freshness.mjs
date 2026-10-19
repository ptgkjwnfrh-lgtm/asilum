// Fails scheduled CI before dated fashion claims silently become stale.
// Covers BOTH trend layers behind lib/asterisk/trends.js: the garment-level
// sourced snapshot AND the aesthetic lifecycle calls (Day 14 reconciliation).
// This intentionally does not scrape TikTok: a human must verify claims and
// direct provenance before updating either dated set.
import {
  FASHION_TREND_SNAPSHOT,
  FASHION_TREND_SNAPSHOT_META,
  getCurrentFashionTrends,
  AESTHETIC_TRENDS,
  AESTHETIC_TREND_META,
  AESTHETIC_PHASES,
} from "../lib/asterisk/trends.js";
import { lookupCulture } from "../lib/asterisk/culture.js";

const asOf = (process.env.TREND_AS_OF || new Date().toISOString()).slice(0, 10);
const errors = [];
const ids = new Set();

for (const trend of FASHION_TREND_SNAPSHOT) {
  if (ids.has(trend.id)) errors.push(`duplicate trend id: ${trend.id}`);
  ids.add(trend.id);
  if (!trend.sources.length) errors.push(`${trend.id}: direct source required`);
  for (const source of trend.sources) {
    if (source.kind === "platform-methodology") {
      errors.push(`${trend.id}: methodology cannot be direct evidence`);
    }
    if (!String(source.url || "").startsWith("https://")) {
      errors.push(`${trend.id}: invalid source URL`);
    }
    if (!source.observedAt) errors.push(`${trend.id}: source observedAt required`);
  }
  if (trend.observedAt > trend.expiresAt) errors.push(`${trend.id}: expiry precedes observation`);
}

const active = getCurrentFashionTrends({ asOf, limit: FASHION_TREND_SNAPSHOT.length });
if (asOf > FASHION_TREND_SNAPSHOT_META.reviewBy) {
  errors.push(`snapshot review overdue: ${FASHION_TREND_SNAPSHOT_META.reviewBy}`);
}
if (active.length < 6) errors.push(`only ${active.length} active trends remain for ${asOf}`);

// ---- aesthetic lifecycle calls (the second dated layer) ----
const aestheticNames = Object.entries(AESTHETIC_TRENDS);
if (asOf > AESTHETIC_TREND_META.reviewBy) {
  errors.push(`aesthetic review overdue: ${AESTHETIC_TREND_META.reviewBy}`);
}
for (const [name, rec] of aestheticNames) {
  if (!AESTHETIC_PHASES.includes(rec.phase)) errors.push(`${name}: unknown phase "${rec.phase}"`);
  if (!String(rec.note || "").trim()) errors.push(`${name}: lifecycle note required`);
  if (!/^\d{4}-\d{2}$/.test(rec.lastReviewed || "")) errors.push(`${name}: lastReviewed must be YYYY-MM`);
  const entity = lookupCulture(name);
  if (!entity || entity.name !== name) errors.push(`${name}: no matching culture entity`);
  for (const id of rec.garmentTrends || []) {
    if (!ids.has(id)) errors.push(`${name}: unknown garment trend link "${id}"`);
    // A dead aesthetic can't ride a live garment record — the layers must agree.
    const garment = FASHION_TREND_SNAPSHOT.find((t) => t.id === id);
    if (rec.phase === "dated" && garment && garment.lifecycle === "acceleration" && garment.expiresAt >= asOf) {
      errors.push(`${name}: dated aesthetic linked to accelerating garment trend "${id}"`);
    }
  }
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`trend-check: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`trend-check: ${active.length} active garment trends + ${aestheticNames.length} aesthetic calls; next review ${FASHION_TREND_SNAPSHOT_META.reviewBy}\n`);
}
