// lib/listing-status/index.js — THE LISTING-STATUS SERVICE (V.2 brief §5
// and §13, owner, 1 Oct 2026). SERVER-ONLY.
//
// A like is a like on ONE listing, not on every listing of the design. This
// service re-checks the listings people kept, through the provider adapter
// that already exists (lib/ingest/adapters: eBay's Browse getItem), on a
// per-provider schedule and quota, and records what it saw:
//
//   sold      — the provider's own confirmed sold signal (eBay: the item's
//               estimatedAvailabilityStatus OUT_OF_STOCK on a fixed-price
//               listing). Only this writes "sold".
//   removed   — the provider says the listing is gone (404/410).
//   unavailable / unknown — the provider answered but not with a sale.
//   source_unavailable — the provider did not answer: NOTHING changes, no
//               event, no notice; the item's last-checked time stays old so
//               the next run tries it first. An outage never looks like a
//               sale. A disappearance alone is not proof of sale.
//
// A transition available → sold writes ONE event (listing_status_events,
// unique per item and status) and ONE outbox row per person who kept the
// piece (notifications, unique per person/kind/subject) — a retry of the
// job, or two workers, cannot notify twice. People who switched the kind
// off get no row. Delivery is in-app; no push or email exists.
//
// Providers without a webhook are polled (PROVIDERS); the quota per run is
// the bound. Everything here reports what it did, by count and by reason.

import { getAdapter } from "../ingest/adapters/index.js";
import { recordAvailabilityCheck } from "../db/production.js";
import { getItem, getItems } from "../db/index.js";
import { recordStatusEvent, usersWhoKept, enqueueNotification } from "../db/production/listingStatus.js";
import { getPool } from "../db/core/pool.js";
import { mem } from "../db/core/store.js";

export const PROVIDERS = Object.freeze({
  ebay: { webhook: false, pollEveryHours: 6, quotaPerRun: 200, backoffMinutes: 30 },
});

/** The adapter's answer → the status word written. Pure. */
export function classify(check) {
  const s = check && check.availability_status;
  if (s === "sold") return "sold";
  if (s === "removed") return "removed";
  if (s === "available") return "available";
  if (s === "source_unavailable") return "source_unavailable";
  if (s === "unavailable" || s === "ended") return s;
  return "unknown";
}

/** Did this answer change the row in a way worth an event? Pure. */
export function transition(fromStatus, toStatus) {
  if (toStatus === "source_unavailable" || toStatus === "unknown") return null;
  if ((fromStatus || "unknown") === toStatus) return null;
  return { from: fromStatus || "unknown", to: toStatus };
}

/**
 * The listings to re-check this run: kept by someone, from a polled
 * provider, not confirmed sold or removed already, oldest check first,
 * at most the provider's quota. Memory mode reads the boards and the
 * interactions; Postgres joins the same three tables.
 */
export async function pickItemsToRecheck({ provider = "ebay", limit = PROVIDERS[provider].quotaPerRun, now = Date.now() } = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error("unknown provider " + provider);
  const due = new Date(now - cfg.pollEveryHours * 3_600_000).toISOString();
  const p = await getPool();
  if (!p) {
    const kept = new Set();
    for (const b of mem.boards.values()) for (const x of b.items || []) if (x && x.id) kept.add(x.id);
    for (const i of mem.interactions) if (i.action === "favorite" || i.action === "save") kept.add(i.itemId);
    const items = (await getItems([...kept]));
    return [...items.values()]
      .filter((it) => (it.source_name || it.source) === provider && !["sold", "removed"].includes(it.availability_status) && it.source_product_id)
      .filter((it) => !it.last_synced_at || new Date(it.last_synced_at).toISOString() <= due)
      .sort((a, b) => String(a.last_synced_at || "") < String(b.last_synced_at || "") ? -1 : 1)
      .slice(0, limit);
  }
  const { rows } = await p.query(
    `SELECT i.*, (SELECT max(checked_at) FROM product_availability_checks c WHERE c.product_id = i.id) AS last_checked_at
       FROM items i
      WHERE i.source_name = $1 AND i.source_product_id IS NOT NULL
        AND i.availability_status NOT IN ('sold', 'removed')
        AND EXISTS (
          SELECT 1 FROM board_items bi WHERE bi.item_id = i.id
          UNION ALL SELECT 1 FROM interactions x WHERE x.item_id = i.id AND x.action IN ('favorite', 'save'))
        AND COALESCE((SELECT max(checked_at) FROM product_availability_checks c WHERE c.product_id = i.id), 'epoch'::timestamptz) <= $2::timestamptz
      ORDER BY last_checked_at NULLS FIRST, i.id
      LIMIT $3`, [provider, due, Math.max(1, Math.min(1000, limit))]);
  return rows.map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
}

/**
 * One run. `adapterOverride` and `items` are injectable for tests. Returns
 * { checked, byStatus, events, notified, optedOut, duplicates, outages }.
 */
export async function recheckKeptItems({ provider = "ebay", limit, now = Date.now(), adapterOverride = null, items = null, log = () => {} } = {}) {
  const adapter = adapterOverride || getAdapter(provider);
  const report = { provider, checked: 0, byStatus: {}, events: 0, notified: 0, optedOut: 0, duplicates: 0, outages: 0, skipped: null };
  if (!adapter || !adapter.enabled().enabled) { report.skipped = `the ${provider} adapter is not enabled`; return report; }
  const list = items || await pickItemsToRecheck({ provider, limit, now });
  for (const item of list) {
    let check;
    try { check = await adapter.checkAvailability(item.source_product_id); } catch { check = { availability_status: "source_unavailable" }; }
    const status = classify(check);
    report.checked++;
    report.byStatus[status] = (report.byStatus[status] || 0) + 1;
    if (status === "source_unavailable") { report.outages++; continue; }   // an outage changes nothing
    const before = item.availability_status || "unknown";
    await recordAvailabilityCheck({ productId: item.id, availabilityStatus: status, previousPrice: item.price ?? null, currentPrice: check.price ?? null, sourceResponseStatus: check.source_response_status ?? null }).catch(() => {});
    if (!(await getPool())) { const m = mem.items.get(item.id); if (m) { m.availability_status = status; m.is_available = status === "available"; m.last_synced_at = new Date(now).toISOString(); } }
    const t = transition(before, status);
    if (!t) continue;
    const ev = await recordStatusEvent({ itemId: item.id, fromStatus: t.from, toStatus: t.to, provider, providerStatus: check.source_response_status ?? null, observedAt: new Date(now).toISOString() });
    if (!ev.recorded) { report.duplicates++; continue; }
    report.events++;
    if (t.to !== "sold") continue;   // only a confirmed sale is a notice
    const keepers = await usersWhoKept(item.id);
    for (const userId of keepers) {
      const r = await enqueueNotification({ userId, kind: "liked-sold", subjectId: item.id, payload: { title: item.title, brand: item.brand, img: item.img || null, price: item.price ?? null, currency: item.currency || "USD", soldAt: ev.observedAt, provider } });
      if (r.queued) report.notified++; else if (r.reason === "opted-out") report.optedOut++; else report.duplicates++;
    }
    log(`${item.id}: ${t.from} → ${t.to}, ${keepers.length} keeper(s)`);
  }
  return report;
}

export { getItem };
