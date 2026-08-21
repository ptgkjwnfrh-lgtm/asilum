// lib/steward/checks.js — what the Asterisk watches when nobody is looking.
//
// Every check is a READ. The steward never writes, never migrates, never
// deletes: it reports, and a person at the admin desk decides. That is not
// timidity, it is the constitution — "no simulated output presented as real"
// has a twin, which is that no autonomous process may take an irreversible
// action on the owner's behalf without the owner.
//
// THE LAW THIS FILE INHERITS (scripts/check-deferred-triggers.mjs): a check
// that cannot be measured must never read as a check that passed. Every
// failure to measure returns `unmeasurable`, which the runner ranks ABOVE ok
// — silence is a finding, not a clean bill of health.
//
// Each check declares:
//   id      stable, dotted, area-first — the handle a report or a fix cites
//   title   what a person would call it
//   area    which part of the machine it watches
//   run     (ctx) => { state, evidence, detail?, action? }
//
// States, worst first: blocker | warn | note | unmeasurable | ok.
// `evidence` is one sentence a human can act on and, wherever a number
// exists, it carries that number — a finding without an amount is an opinion.

export const STATES = Object.freeze(["blocker", "warn", "note", "unmeasurable", "ok"]);

const RANK = Object.freeze(Object.fromEntries(STATES.map((s, i) => [s, i])));
export function worseOf(a, b) { return RANK[a] <= RANK[b] ? a : b; }
export function stateRank(s) { return RANK[s] ?? RANK.unmeasurable; }

/** Every check refuses the same way when its evidence is out of reach. */
function unmeasurable(evidence, action = null) {
  return { state: "unmeasurable", evidence, action };
}

const n = (row, key = "n") => Number(row?.[key] ?? 0);

// ---------------------------------------------------------------------------
// DATA INTEGRITY
// ---------------------------------------------------------------------------

export const foreignCounters = {
  id: "data.foreign-counters",
  title: "counters for entities the catalog cannot serve",
  area: "brain",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — counters unread");
    const [{ rows: foreign }, { rows: total }] = await Promise.all([
      query("select count(*)::int as n from popularity p where not exists (select 1 from items i where i.id = p.item_id)"),
      query("select count(*)::int as n from popularity"),
    ]);
    const f = n(foreign[0]), t = n(total[0]);
    if (!t) return { state: "ok", evidence: "the popularity table is empty — nothing to rank yet" };
    const share = f / t;
    // The ranking population is filtered at read time (lib/brain/popularity.js),
    // so foreign rows no longer distort exposure percentiles. They are still
    // worth watching: a rising share means an ingestion path is writing
    // catalog counters for something that is not a catalog item.
    return {
      state: share > 0.25 ? "warn" : f ? "note" : "ok",
      evidence: `${f} of ${t} counter rows (${(share * 100).toFixed(1)}%) name ids the catalog cannot serve`,
      detail: { foreign: f, total: t, share: +share.toFixed(4) },
      action: f
        ? "expected for wire transmissions; a jump means a writer is mislabeling ids. Probe rows (l1-alpha and friends) are pollution and can be deleted by the owner."
        : null,
    };
  },
};

export const danglingEdges = {
  id: "data.dangling-edges",
  title: "co-engagement edges pointing at missing items",
  area: "brain",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — the graph is unread");
    const { rows } = await query(
      "select count(*)::int as n from edges e where not exists (select 1 from items i where i.id = e.a) or not exists (select 1 from items i where i.id = e.b)");
    const { rows: tot } = await query("select count(*)::int as n from edges");
    const bad = n(rows[0]), total = n(tot[0]);
    return {
      state: bad ? "note" : "ok",
      evidence: `${bad} of ${total} edges name an item that no longer exists`,
      detail: { dangling: bad, total },
      action: bad ? "gamma resolves these to nothing, so they cost recall rather than correctness — they are safe to leave and safe for the owner to delete." : null,
    };
  },
};

export const selfEdges = {
  id: "data.self-edges",
  title: "an item co-engaged with itself",
  area: "brain",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — the graph is unread");
    const { rows } = await query("select count(*)::int as n from edges where a = b");
    const bad = n(rows[0]);
    return {
      state: bad ? "warn" : "ok",
      evidence: bad ? `${bad} edges join an item to itself` : "no item is its own neighbor",
      detail: { selfEdges: bad },
      action: bad ? "a self-edge is always a writer bug: it lets one piece boost itself through gamma." : null,
    };
  },
};

// ---------------------------------------------------------------------------
// THE DATABASE'S OWN GUARANTEES
// ---------------------------------------------------------------------------

export const rlsCoverage = {
  id: "db.rls-coverage",
  title: "row-level security enabled without a policy",
  area: "database",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — RLS unread");
    const { rows } = await query(`
      select t.tablename from pg_tables t
       where t.schemaname = 'public' and t.rowsecurity
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
       order by t.tablename`);
    const names = rows.map((r) => r.tablename);
    // This is the shape of the biggest find in this repo's history: RLS on
    // with no policy is default-DENY, and the app role has no rolbypassrls —
    // so a GRANT is not access. business_accounts was locked out of itself for
    // weeks, invisible because an empty list is what the page was meant to show.
    return {
      state: names.length ? "blocker" : "ok",
      evidence: names.length
        ? `${names.length} table(s) have RLS on and no policy — the app is locked out of them: ${names.join(", ")}`
        : "every RLS table carries a policy",
      detail: { tables: names },
      action: names.length ? "add the asilum_app_server_access policy in a migration; tests/rls-app-policy.test.js fails any migration that forgets." : null,
    };
  },
};

export const migrationLedger = {
  id: "db.migration-ledger",
  title: "applied migrations vs the files in the repo",
  area: "database",
  async run({ query, schemaVersions }) {
    if (!query) return unmeasurable("no database configured — the ledger is unread");
    const { rows } = await query("select version from app_schema_migrations order by version");
    const applied = rows.map((r) => Number(r.version)).filter(Number.isFinite);
    if (!applied.length) return unmeasurable("the ledger table is empty — cannot compare");
    const max = Math.max(...applied);
    const set = new Set(applied);
    const floor = Math.min(...applied);
    // Holes BELOW the ledger's own floor are history (versions 1-6 predate the
    // ledger); holes above it are a migration that ran without recording, or a
    // record without a run.
    const holes = [];
    for (let v = floor; v <= max; v++) if (!set.has(v)) holes.push(v);
    // The repo's migration files are not always in reach — a serverless route
    // does not carry supabase/ in its bundle. When they are missing the check
    // still finds HOLES (its main job) and says out loud that it could not
    // compare files, rather than reporting a comparison it never made.
    const filesCompared = Array.isArray(schemaVersions);
    const unrecorded = filesCompared ? schemaVersions.filter((v) => v >= floor && !set.has(v)) : [];
    const state = holes.length || unrecorded.length ? "warn" : "ok";
    const fileNote = filesCompared ? "" : " (migration files not visible from here — holes only)";
    return {
      state,
      evidence: state === "ok"
        ? `ledger continuous from v${floor} to v${max} (${applied.length} rows)${fileNote}`
        : `holes ${holes.join(", ") || "none"}; files with no ledger row: ${unrecorded.join(", ") || "none"}`,
      detail: { floor, max, count: applied.length, holes, unrecorded, filesCompared },
      action: state === "ok" ? null : "every schema-vN.sql ends with its app_schema_migrations INSERT — a hole means one ran without recording.",
    };
  },
};

// ---------------------------------------------------------------------------
// CATALOG
// ---------------------------------------------------------------------------

export const catalogIntegrity = {
  id: "catalog.integrity",
  title: "items a reader could meet in a broken state",
  area: "catalog",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — the catalog is unread");
    // NO IMAGE DIMENSION, DELIBERATELY. Every one of the 915 items has a null
    // `img` and product_images is empty: the catalog is drawn with the
    // deterministic placeholder thumbs (thumbFor, lib/client.js), which is the
    // shipped design and not a defect. A check that reports a permanent,
    // unfixable finding is how the whole board gets ignored — #281's lesson,
    // one layer up. Add it back the day real photography lands.
    const { rows } = await query(`
      select
        count(*)::int as total,
        count(*) filter (where price is null or price <= 0)::int as bad_price,
        count(*) filter (where title is null or btrim(title) = '')::int as no_title,
        count(*) filter (where brand is null or btrim(brand) = '')::int as no_brand
      from items`);
    const r = rows[0] || {};
    const broken = n(r, "bad_price") + n(r, "no_title");
    const soft = n(r, "no_brand");
    return {
      state: broken ? "blocker" : soft ? "note" : "ok",
      evidence: broken
        ? `${broken} item(s) cannot be shown honestly: ${n(r, "bad_price")} without a real price, ${n(r, "no_title")} without a title`
        : `${n(r, "total")} items, all priced and titled${soft ? ` (${soft} without a brand)` : ""}`,
      detail: { total: n(r, "total"), badPrice: n(r, "bad_price"), noTitle: n(r, "no_title"), noBrand: n(r, "no_brand") },
      action: broken ? "the checkout gate already refuses these; they still reach discovery and search as dead ends." : null,
    };
  },
};

// ---------------------------------------------------------------------------
// COMMERCE — the append-only ledger must agree with its projection
// ---------------------------------------------------------------------------

export const orderProjection = {
  id: "commerce.order-projection",
  title: "orders that disagree with their own event history",
  area: "commerce",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — orders unread");
    const { rows: tot } = await query("select count(*)::int as n from orders");
    const total = n(tot[0]);
    if (!total) return { state: "ok", evidence: "no orders yet — nothing to reconcile" };
    // `paid` is terminal and never downgrades (lib/orders.js). An order whose
    // events contain a paid signal while the projection says otherwise is the
    // one disagreement that costs money.
    const { rows } = await query(`
      select count(*)::int as n from orders o
       where o.status <> 'paid'
         and exists (select 1 from order_events e where e.order_id = o.id and e.type = 'paid')`);
    const { rows: fee } = await query("select count(*)::int as n from orders where status = 'paid' and fee_cents is null");
    const drift = n(rows[0]), noFee = n(fee[0]);
    return {
      state: drift ? "blocker" : noFee ? "warn" : "ok",
      evidence: drift
        ? `${drift} order(s) have a paid event and an unpaid projection`
        : `${total} order(s), projection agrees with the ledger${noFee ? `; ${noFee} paid without a recorded founders fee` : ""}`,
      detail: { total, drift, paidWithoutFee: noFee },
      action: drift ? "reconcile-on-read (/api/checkout GET) rebuilds a projection from events; a persistent disagreement is a webhook that never landed." : null,
    };
  },
};

export const orphanInteractions = {
  id: "identity.orphan-interactions",
  title: "interactions pointing at items that no longer exist",
  area: "identity",
  async run({ query }) {
    if (!query) return unmeasurable("no database configured — interactions unread");
    const { rows } = await query(`
      select count(*)::int as n from interactions x
       where not exists (select 1 from items i where i.id = x.item_id)`);
    const { rows: tot } = await query("select count(*)::int as n from interactions");
    const bad = n(rows[0]), total = n(tot[0]);
    const share = total ? bad / total : 0;
    return {
      state: share > 0.05 ? "warn" : bad ? "note" : "ok",
      evidence: `${bad} of ${total} interactions name an item the catalog no longer holds (${(share * 100).toFixed(1)}%)`,
      detail: { orphans: bad, total, share: +share.toFixed(4) },
      action: bad ? "taste survives the item, so these are harmless history — but a rising share means the catalog is churning under the readers." : null,
    };
  },
};

export const CHECKS = Object.freeze([
  rlsCoverage,
  catalogIntegrity,
  orderProjection,
  migrationLedger,
  selfEdges,
  foreignCounters,
  danglingEdges,
  orphanInteractions,
]);
