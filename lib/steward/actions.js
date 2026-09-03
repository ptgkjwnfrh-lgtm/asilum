// lib/steward/actions.js — the steward's hands.
//
// A check (checks.js) says what is wrong. An action here says what the
// steward would DO about it, in three parts that the runner (index.js) keeps
// apart on purpose:
//
//   plan(q, finding, cap)   READS. Names the exact rows it would touch, the
//                           exact rows a revert would need, and one sentence.
//                           Never more than `cap` rows. May be run by anyone,
//                           any time — it is how the desk shows "what the
//                           hands would do" without doing it.
//   apply(q, plan)          WRITES, inside a transaction the runner opened
//                           AFTER the ledger row for this action was inserted
//                           on the same connection. Returns how many rows it
//                           actually touched. If that is not the number the
//                           plan named, the runner rolls the whole thing back:
//                           the world moved between plan and act, and a
//                           ledger row claiming N when M happened must not
//                           stand.
//   revert(q, inverse)      WRITES the inverse the plan recorded, under the
//                           same rule — a 'reverted' row goes first, and the
//                           count must match or nothing happens.
//
// Every SQL statement here is guarded by the state it expects (`and
// moderation_status = 'visible'`, `and status = 'observed'`), so a row a
// person changed between plan and act is not touched — it is counted as the
// world having moved, and reported.
//
// What may run at all is not decided here. decisions.js declares the tier and
// the cap; this file only knows how.

import { RESEARCH_DEMAND_THRESHOLD } from "../asterisk/unknownQueries.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// data.prune-dangling-edges — co-engagement edges naming an item that is gone
// ---------------------------------------------------------------------------
export const pruneDanglingEdges = {
  id: "data.prune-dangling-edges",
  check: "data.dangling-edges",
  title: "delete co-engagement edges that point at missing items",
  async plan(q, finding, cap) {
    const { rows } = await q(
      `select a, b, w from edges e
        where not exists (select 1 from items i where i.id = e.a)
           or not exists (select 1 from items i where i.id = e.b)
        order by a, b
        limit $1`, [cap]);
    if (!rows.length) return null;
    const targets = rows.map((r) => ({ a: r.a, b: r.b }));
    const inverse = rows.map((r) => ({ a: r.a, b: r.b, w: Number(r.w) }));
    return {
      count: rows.length, targets, inverse,
      evidence: `delete ${plural(rows.length, "edge")} whose item no longer exists${finding?.detail?.dangling > rows.length ? ` (${finding.detail.dangling} in total — capped at ${cap} per run)` : ""}`,
    };
  },
  async apply(q, plan) {
    const { rows } = await q(
      `delete from edges e
        using unnest($1::text[], $2::text[]) as x(a, b)
        where e.a = x.a and e.b = x.b
        returning e.a`,
      [plan.targets.map((t) => t.a), plan.targets.map((t) => t.b)]);
    return { count: rows.length };
  },
  async revert(q, inverse) {
    const { rows } = await q(
      `insert into edges (a, b, w)
        select * from unnest($1::text[], $2::text[], $3::real[])
        on conflict (a, b) do nothing
        returning a`,
      [inverse.map((r) => r.a), inverse.map((r) => r.b), inverse.map((r) => r.w)]);
    return { count: rows.length };
  },
};

// ---------------------------------------------------------------------------
// catalog.hold-unshowable — a piece with no honest price or no title
// ---------------------------------------------------------------------------
export const holdUnshowable = {
  id: "catalog.hold-unshowable",
  check: "catalog.integrity",
  title: "take pieces that cannot be shown honestly off the floor, under review",
  async plan(q, finding, cap) {
    const { rows } = await q(
      `select id, moderation_status, title, price from items
        where moderation_status = 'visible'
          and (price is null or price <= 0 or title is null or btrim(title) = '')
        order by id
        limit $1`, [cap]);
    if (!rows.length) return null;
    return {
      count: rows.length,
      targets: rows.map((r) => ({ id: r.id, why: r.price == null || Number(r.price) <= 0 ? "no real price" : "no title" })),
      inverse: rows.map((r) => ({ id: r.id, moderation_status: r.moderation_status })),
      evidence: `hold ${plural(rows.length, "piece")} under review — they reach discovery and search as dead ends today. No price is invented; a person decides what they are.`,
    };
  },
  async apply(q, plan) {
    const { rows } = await q(
      `update items set moderation_status = 'under_review'
        where id = any($1) and moderation_status = 'visible'
        returning id`,
      [plan.targets.map((t) => t.id)]);
    return { count: rows.length };
  },
  async revert(q, inverse) {
    const { rows } = await q(
      `update items i set moderation_status = x.s
        from unnest($1::text[], $2::text[]) as x(id, s)
        where i.id::text = x.id and i.moderation_status = 'under_review'
        returning i.id`,
      [inverse.map((r) => String(r.id)), inverse.map((r) => r.moderation_status)]);
    return { count: rows.length };
  },
};

// ---------------------------------------------------------------------------
// asterisk.promote-demand — a question enough people asked, marked for research
// ---------------------------------------------------------------------------
export const promoteDemand = {
  id: "asterisk.promote-demand",
  check: "asterisk.unknown-demand",
  title: "mark repeat-demand unknown queries as research_created",
  async plan(q, finding, cap) {
    const { rows } = await q(
      `select id, normalized_query, distinct_identities, reviewed_by from unknown_queries
        where status = 'observed' and distinct_identities >= $1
        order by distinct_identities desc, last_seen desc
        limit $2`, [RESEARCH_DEMAND_THRESHOLD, cap]);
    if (!rows.length) return null;
    return {
      count: rows.length,
      targets: rows.map((r) => ({ id: r.id, query: r.normalized_query, people: Number(r.distinct_identities) })),
      inverse: rows.map((r) => ({ id: r.id, status: "observed", reviewed_by: r.reviewed_by ?? null })),
      evidence: `promote ${plural(rows.length, "unknown query")} asked by ${RESEARCH_DEMAND_THRESHOLD}+ people into research — a mark, not an answer; the proposal still travels the reviewed pipeline`,
    };
  },
  async apply(q, plan, { actor }) {
    const { rows } = await q(
      `update unknown_queries
          set status = 'research_created', reviewed_by = $2, updated_at = now()
        where id = any($1) and status = 'observed' and distinct_identities >= $3
        returning id`,
      [plan.targets.map((t) => t.id), actor, RESEARCH_DEMAND_THRESHOLD]);
    return { count: rows.length };
  },
  async revert(q, inverse) {
    const { rows } = await q(
      `update unknown_queries
          set status = 'observed', updated_at = now()
        where id = any($1) and status = 'research_created'
        returning id`,
      [inverse.map((r) => r.id)]);
    return { count: rows.length };
  },
};

// ---------------------------------------------------------------------------
// commerce.reproject-order — the projection disagrees with its own ledger
// ---------------------------------------------------------------------------
export const reprojectOrder = {
  id: "commerce.reproject-order",
  check: "commerce.order-projection",
  title: "set the paid projection on orders whose ledger already holds a paid event",
  async plan(q, finding, cap) {
    const { rows } = await q(
      `select o.id, o.status from orders o
        where o.status <> 'paid'
          and exists (select 1 from order_events e where e.order_id = o.id and e.type = 'paid')
        order by o.id
        limit $1`, [cap]);
    if (!rows.length) return null;
    return {
      count: rows.length,
      targets: rows.map((r) => ({ id: r.id, from: r.status, to: "paid" })),
      inverse: rows.map((r) => ({ id: r.id, status: r.status })),
      evidence: `set ${plural(rows.length, "order")} to paid — each already carries a paid event; no event is written, no mail is sent, no fee is recorded`,
    };
  },
  async apply(q, plan) {
    const { rows } = await q(
      `update orders o set status = 'paid'
        where o.id = any($1) and o.status <> 'paid'
          and exists (select 1 from order_events e where e.order_id = o.id and e.type = 'paid')
        returning o.id`,
      [plan.targets.map((t) => t.id)]);
    return { count: rows.length };
  },
  async revert(q, inverse) {
    const { rows } = await q(
      `update orders o set status = x.s
        from unnest($1::text[], $2::text[]) as x(id, s)
        where o.id::text = x.id and o.status = 'paid'
        returning o.id`,
      [inverse.map((r) => String(r.id)), inverse.map((r) => r.status)]);
    return { count: rows.length };
  },
};

export const ACTIONS = Object.freeze([
  pruneDanglingEdges,
  holdUnshowable,
  promoteDemand,
  reprojectOrder,
]);

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** The action implementation for an id, or null. `never`-tier ids have none. */
export function actionFor(id) {
  return BY_ID.get(id) || null;
}

/** Every action that answers a check. */
export function actionsForCheck(checkId) {
  return ACTIONS.filter((a) => a.check === checkId);
}
