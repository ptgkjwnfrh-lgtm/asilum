// Fails scheduled CI before editorial fashion context silently becomes stale.
// This intentionally does not scrape TikTok: a human must verify claims and
// direct provenance before updating the dated snapshot.
import {
  FASHION_TREND_SNAPSHOT,
  FASHION_TREND_SNAPSHOT_META,
  getCurrentFashionTrends,
} from "../lib/ai/trendKnowledge.js";

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

if (errors.length) {
  for (const error of errors) process.stderr.write(`trend-check: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`trend-check: ${active.length} active trends; next review ${FASHION_TREND_SNAPSHOT_META.reviewBy}\n`);
}
