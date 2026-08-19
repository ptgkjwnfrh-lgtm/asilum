// app/api/admin/route.js
// Admin/moderation backend — no public UI yet (deliberate: the public design
// is locked; a full admin page can mount on these functions later).
//
// Auth: ADMIN_TOKEN env var; requests send "Authorization: Bearer <token>".
// Unset token = admin disabled entirely (503, honest error).
//
// GET  ?area=overview|tags|mappings|sync-logs|search-logs|tickets|adapters|business
// POST { action, ... }:
//   business.approve { accountId, note? }   — raise passport → business
//   business.reject  { accountId, note }    — note required; applicant reads it
//   tag.add    { productId, tag, tagType?, confidence? }
//   tag.delete { id }
//   tag.merge  { from, to }
//   mapping.upsert { searchPhrase, mappedTags, relatedTerms, referenceType?, confidence? }
//   mapping.delete { searchPhrase }
//   product.moderate { productId, status: visible|hidden|flagged }
//   sync.run   { query?, limit? }
//   inventory.upsert { sourceName, items: [...] } — real-inventory intake
//     (L1); every item must pass the checkout honesty gate or the whole
//     batch refuses 409 with per-index reasons. docs/DESIGNER-INTAKE.md.
//   business.domain-check { accountId } — read-only evidence collector:
//     is the account's verify token served by its claimed domains?
//   business.link-source { accountId, sourceName } — verified business ↔
//     inventory namespace, unique, one time each.
//   inventory.import-shopify { accountId, currency? } — consented bulk
//     import from the business's own store; gate-passing items land,
//     failures are reported loudly (partial, unlike inventory.upsert).

import { NextResponse } from "next/server";
import { getPool, upsertItems } from "../../../lib/db/index.js";
import { validateIntakeBatch, validSourceName } from "../../../lib/ingest/intake.js";
import { typedTagsFrom } from "../../../lib/ingest/adapters/normalize.js";
import { checkDomainProof } from "../../../lib/brands/verify.js";
import { importShopifyInventory } from "../../../lib/brands/shopify.js";
import {
  getProductTags, addProductTags, deleteProductTag, mergeProductTags,
  listSearchMappings, upsertSearchMapping, deleteSearchMapping,
  listSyncLogs,
  listBusinessApplications, listVerifiedBusinesses, decideBusinessApplication,
  getBusinessAccount, setBusinessSourceName,
} from "../../../lib/db/production.js";
import { adapterStatuses } from "../../../lib/ingest/adapters/index.js";
import { bearerToken, secureTokenEqual } from "../../../lib/security/request.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

function authed(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) return { ok: false, status: 503, error: "admin disabled — set ADMIN_TOKEN (16+ chars)" };
  if (!secureTokenEqual(bearerToken(req), token)) return { ok: false, status: 401, error: "bad admin token" };
  return { ok: true };
}

// Audit attribution is server configuration, never caller-controlled JSON.
// ADMIN_TOKEN authenticates the operator surface; ADMIN_ACTOR names that
// operator in durable review/case ledgers.
function adminActor() {
  const actor = String(process.env.ADMIN_ACTOR || "admin").trim();
  return actor ? actor.slice(0, 80) : "admin";
}

export async function GET(req) {
  const gate = authed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const quota = await consumeRateLimit({ scope: "admin-read", subject: "operator", limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") || "overview";
  const p = await getPool();

  try {
    if (area === "adapters") return NextResponse.json({ adapters: adapterStatuses() });
    if (area === "business") {
      // The booth review desk: pending applications + the current roster.
      return NextResponse.json({
        applications: await listBusinessApplications({ status: "under_review", limit: 100 }),
        verified: await listVerifiedBusinesses(50),
      });
    }
    if (area === "mappings") return NextResponse.json({ mappings: await listSearchMappings() });
    if (area === "sync-logs") return NextResponse.json({ logs: await listSyncLogs() });
    if (area === "tags") {
      const productId = searchParams.get("productId");
      if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
      return NextResponse.json({ tags: await getProductTags(productId) });
    }
    if (area === "search-logs") {
      if (!p) return NextResponse.json({ logs: [], persistent: false });
      const { rows } = await p.query("SELECT * FROM search_logs ORDER BY created_at DESC LIMIT 100");
      return NextResponse.json({ logs: rows, persistent: true });
    }
    if (area === "tickets") {
      if (!p) return NextResponse.json({ tickets: [], persistent: false });
      const { rows } = await p.query("SELECT * FROM purchase_tickets ORDER BY created_at DESC LIMIT 100");
      return NextResponse.json({ tickets: rows, persistent: true });
    }
    // overview
    const counts = { persistent: !!p };
    if (p) {
      for (const t of ["items", "product_tags", "search_mappings", "search_logs", "purchase_tickets", "editorial_posts", "mood_board_uploads", "stylist_outfits"]) {
        counts[t] = (await p.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
      }
    }
    return NextResponse.json({ counts, adapters: adapterStatuses() });
  } catch {
    return NextResponse.json({ error: "admin read failed" }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = authed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const quota = await consumeRateLimit({ scope: "admin-write", subject: "operator", limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;

  try {
    switch (body.action) {
      case "business.domain-check": {
        // Evidence COLLECTOR for the verification case — reports whether the
        // account's token is served by its claimed domains. Read-only: the
        // named human attaches this when deciding; no machine path to
        // verified (v18 law).
        const account = await getBusinessAccount(String(body.accountId || ""));
        if (!account) return NextResponse.json({ error: "no application for that account" }, { status: 404 });
        const report = await checkDomainProof({
          websiteUrl: account.websiteUrl,
          shopifyDomain: account.shopifyDomain,
          accountId: account.accountId,
        });
        return NextResponse.json({
          ...report,
          note: report.found
            ? "attach this as evidence on the decide step — a named human still makes the call"
            : "token not found — the applicant places it (meta tag or /.well-known/asilum-verify.txt), then re-run",
        });
      }
      case "business.link-source": {
        const named = validSourceName(body.sourceName);
        if (!named.ok) return NextResponse.json({ error: named.reason }, { status: 400 });
        try {
          const row = await setBusinessSourceName(String(body.accountId || ""), named.source);
          return NextResponse.json({ linked: { accountId: row.accountId, brandName: row.brandName, sourceName: row.sourceName } });
        } catch (err) {
          const msg = err && err.message ? err.message : "link failed";
          const status = /another business/.test(msg) ? 409 : /verified business|no business/.test(msg) ? 409 : 500;
          return NextResponse.json({ error: msg }, { status });
        }
      }
      case "inventory.import-shopify": {
        // Consented bulk import from the business's own store. Partial with a
        // LOUD skip report (contrast: inventory.upsert is atomic on purpose).
        const account = await getBusinessAccount(String(body.accountId || ""));
        if (!account) return NextResponse.json({ error: "no application for that account" }, { status: 404 });
        if (account.status !== "business") {
          return NextResponse.json({ error: "only a verified business imports inventory" }, { status: 409 });
        }
        if (!account.sourceName) {
          return NextResponse.json({ error: "link a source name first (business.link-source)" }, { status: 409 });
        }
        const currency = /^[A-Za-z]{3}$/.test(String(body.currency || "")) ? String(body.currency).toUpperCase() : "USD";
        const result = await importShopifyInventory({
          shopifyDomain: account.shopifyDomain,
          sourceName: account.sourceName,
          currency,
        });
        if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
        if (result.imported.length) {
          await upsertItems(result.imported);
          for (const p of result.imported) {
            await addProductTags(p.id, typedTagsFrom(p));
          }
        }
        return NextResponse.json({
          imported: result.imported.length,
          skipped: result.skipped,
          items: result.imported.map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, availability_status: p.availability_status })),
        });
      }
      case "inventory.upsert": {
        // Real-inventory intake (risk campaign L1). The checkout engine's own
        // honesty gate validates every item BEFORE anything is written — one
        // bad item refuses the whole batch with per-index reasons, so the
        // catalog can never drift half-real. docs/DESIGNER-INTAKE.md is the
        // operator runbook.
        const { ok, problems, normalized } = validateIntakeBatch(body.items, body.sourceName);
        if (!ok) {
          return NextResponse.json({ error: "intake refused — nothing written", problems }, { status: 409 });
        }
        await upsertItems(normalized);
        for (const p of normalized) {
          await addProductTags(p.id, typedTagsFrom(p));
        }
        return NextResponse.json({
          upserted: normalized.length,
          items: normalized.map((p) => ({ id: p.id, title: p.title, price: p.price, currency: p.currency, availability_status: p.availability_status })),
        });
      }
      case "tag.add":
        return NextResponse.json({
          added: await addProductTags(body.productId, [{ tag: body.tag, tagType: body.tagType, confidence: body.confidence, source: "admin" }]),
        });
      case "tag.delete":
        return NextResponse.json({ deleted: await deleteProductTag(body.id) });
      case "tag.merge":
        return NextResponse.json({ merged: await mergeProductTags(body.from, body.to) });
      case "mapping.upsert":
        return NextResponse.json({ mapping: await upsertSearchMapping(body) });
      case "mapping.delete":
        return NextResponse.json({ deleted: await deleteSearchMapping(body.searchPhrase) });
      case "product.moderate": {
        const p = await getPool();
        if (!p) return NextResponse.json({ error: "requires database" }, { status: 503 });
        if (!["visible", "hidden", "flagged"].includes(body.status)) {
          return NextResponse.json({ error: "status must be visible, hidden, or flagged" }, { status: 400 });
        }
        const status = body.status;
        const r = await p.query(
          "UPDATE items SET moderation_status=$2, flagged=($2='flagged'), updated_at=now() WHERE id=$1",
          [body.productId, status]
        );
        return NextResponse.json({ moderated: r.rowCount });
      }
      case "business.approve":
      case "business.reject": {
        // The human decision the whole upgrade waits on. Attribution is
        // the server-configured operator, never caller JSON; the linked
        // verification case enforces evidence + CAS underneath.
        const accountId = String(body.accountId || "").trim();
        if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
        const approve = body.action === "business.approve";
        const note = body.note ? String(body.note).slice(0, 500) : null;
        if (!approve && !note) {
          return NextResponse.json({ error: "a rejection carries a note — the applicant reads it" }, { status: 400 });
        }
        try {
          const row = await decideBusinessApplication({ accountId, approve, note, actor: adminActor() });
          return NextResponse.json({ account: row });
        } catch (error) {
          return NextResponse.json({ error: String(error?.message || "decision failed") }, { status: 409 });
        }
      }
      case "sync.run": {
        const { syncProducts } = await import("../../../lib/ingest/adapters/sync.js");
        return NextResponse.json({ runs: await syncProducts({ query: body.query, limit: body.limit }) });
      }
      // ---- AI-foundation inspection (Day 9): admin/debug review ----
      case "ai.events": {
        const { listAiModelEvents } = await import("../../../lib/db/production.js");
        return NextResponse.json({ events: await listAiModelEvents({ feature: body.feature || null, limit: body.limit || 100 }) });
      }
      case "ai.analyses": {
        const { listMoodBoardAnalyses } = await import("../../../lib/db/production.js");
        if (!body.user) return NextResponse.json({ error: "user required" }, { status: 400 });
        return NextResponse.json({ analyses: await listMoodBoardAnalyses(body.user, body.limit || 60) });
      }
      case "ai.profile": {
        const { getUserStyleProfileRow } = await import("../../../lib/db/production.js");
        if (!body.user) return NextResponse.json({ error: "user required" }, { status: 400 });
        return NextResponse.json({ profile: await getUserStyleProfileRow(body.user) });
      }
      case "ai.config": {
        const { describeAiConfig } = await import("../../../lib/ai/config.js");
        return NextResponse.json({ config: describeAiConfig() });
      }
      case "stylist.feedback": {
        const { listStylistFeedback } = await import("../../../lib/db/production.js");
        if (!body.user) return NextResponse.json({ error: "user required" }, { status: 400 });
        return NextResponse.json({ feedback: await listStylistFeedback(body.user, body.limit || 100) });
      }
      // ---- Asterisk AI (Day 10): dual-tag audit, ontology, facts, moderation ----
      case "asterisk.audit": {
        const { auditProductTags } = await import("../../../lib/asterisk/tagAudit.js");
        if (!body.productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
        const r = await auditProductTags(body.productId);
        return NextResponse.json(r, { status: r.ok ? 200 : 404 });
      }
      case "asterisk.aiTags": {
        const { getProductAiTags } = await import("../../../lib/db/production.js");
        if (!body.productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
        return NextResponse.json({ aiTags: await getProductAiTags(body.productId) });
      }
      case "asterisk.reconciliations": {
        const { listTagReconciliations } = await import("../../../lib/db/production.js");
        return NextResponse.json({ reconciliations: await listTagReconciliations({
          productId: body.productId || null,
          reviewRequired: typeof body.reviewRequired === "boolean" ? body.reviewRequired : null,
          limit: body.limit || 50 }) });
      }
      case "asterisk.ontology.sync": {
        const { syncOntology } = await import("../../../lib/asterisk/ontology.js");
        return NextResponse.json({ upserted: await syncOntology() });
      }
      case "asterisk.ontology": {
        const { listOntologyTags } = await import("../../../lib/db/production.js");
        return NextResponse.json({ tags: await listOntologyTags({ tagType: body.tagType || null, limit: body.limit || 500 }) });
      }
      case "asterisk.fact.record": {
        const { recordFact } = await import("../../../lib/asterisk/facts.js");
        const r = await recordFact(body);
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.fact.review": {
        const { reviewFact } = await import("../../../lib/asterisk/facts.js");
        const r = await reviewFact(body.id, body.status, adminActor());
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.facts": {
        const { listLearnedFacts } = await import("../../../lib/db/production.js");
        return NextResponse.json({ facts: await listLearnedFacts({
          entityType: body.entityType || null, entityId: body.entityId || null,
          status: body.status || null, limit: body.limit || 100 }) });
      }
      case "asterisk.corrections": {
        const { listUserCorrections } = await import("../../../lib/db/production.js");
        if (!body.user) return NextResponse.json({ error: "user required" }, { status: 400 });
        return NextResponse.json({ corrections: await listUserCorrections(body.user, body.limit || 100) });
      }
      // ---- research-ingestion pipeline (Day 15, P2 v1) ----
      case "asterisk.research.propose": {
        const { proposeCultureEntity } = await import("../../../lib/asterisk/research.js");
        const r = await proposeCultureEntity(body.proposal || {}, {
          sourceUrls: body.sourceUrls, sourceTypes: body.sourceTypes,
          publicationDates: body.publicationDates,
          reliabilityScore: body.reliabilityScore, modelVersion: body.modelVersion || null,
        });
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.research.queue": {
        const { researchQueue } = await import("../../../lib/asterisk/research.js");
        return NextResponse.json({ proposals: await researchQueue({
          status: body.status || null, limit: body.limit || 100 }) });
      }
      case "asterisk.research.review": {
        const { reviewResearch } = await import("../../../lib/asterisk/research.js");
        const r = await reviewResearch(body.id, body.status, adminActor());
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.research.approved": {
        const { approvedCultureProposals } = await import("../../../lib/asterisk/research.js");
        return NextResponse.json(await approvedCultureProposals());
      }
      case "asterisk.research.fetch": {
        const { fetchResearchSource } = await import("../../../lib/asterisk/research.js");
        if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
        const r = await fetchResearchSource(String(body.url));
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      // ---- unknown-query aggregation (Phase 1) ----
      case "asterisk.unknown.list": {
        const { unknownQueryQueue } = await import("../../../lib/asterisk/unknownQueries.js");
        return NextResponse.json({ unknownQueries: await unknownQueryQueue({
          status: body.status === "all" ? null : (body.status || "observed"), limit: body.limit || 50 }) });
      }
      case "asterisk.unknown.promote": {
        const { promoteUnknownQuery } = await import("../../../lib/asterisk/unknownQueries.js");
        const r = await promoteUnknownQuery(body.id, adminActor());
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.unknown.resolve": {
        const { resolveUnknownQuery } = await import("../../../lib/asterisk/unknownQueries.js");
        const r = await resolveUnknownQuery(body.id, adminActor(), body.researchFactId || null);
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.unknown.dismiss": {
        const { dismissUnknownQuery } = await import("../../../lib/asterisk/unknownQueries.js");
        const r = await dismissUnknownQuery(body.id, adminActor());
        return NextResponse.json(r, { status: r.ok ? 200 : 400 });
      }
      case "asterisk.research.draft": {
        const { draftProposalsFromSource } = await import("../../../lib/asterisk/research.js");
        return NextResponse.json(await draftProposalsFromSource());
      }
      case "brand.case.open": {
        const { validateOpenCase } = await import("../../../lib/brands/cases.js");
        const { insertBrandCase } = await import("../../../lib/db/production.js");
        let opened;
        try {
          opened = validateOpenCase({ ...body, openedBy: adminActor() });
        } catch (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ case: await insertBrandCase(opened) });
      }
      case "brand.case.transition": {
        const { validateTransition } = await import("../../../lib/brands/cases.js");
        const { getBrandCase, applyBrandCaseTransition } = await import("../../../lib/db/production.js");
        const kase = await getBrandCase(String(body.id || ""));
        if (!kase) return NextResponse.json({ error: "case not found" }, { status: 404 });
        let t;
        try {
          t = validateTransition(kase, { to: body.to, actor: adminActor(),
            evidence: body.evidence, resolution: body.resolution });
          if (body.note !== undefined) t.note = String(body.note).slice(0, 500);
        } catch (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        try {
          const moved = await applyBrandCaseTransition(kase.id, kase.status, t);
          return NextResponse.json({ case: moved });
        } catch (error) {
          if (error?.message === "case-moved") {
            return NextResponse.json({ error: "case moved under you — re-read and retry" }, { status: 409 });
          }
          throw error;
        }
      }
      case "brand.cases.list": {
        const { listBrandCases } = await import("../../../lib/db/production.js");
        return NextResponse.json({ cases: await listBrandCases({
          status: body.status || null, kind: body.kind || null,
          brandName: body.brandName || null, limit: body.limit || 100 }) });
      }
      case "brand.case.get": {
        const { getBrandCase, listBrandCaseEvents } = await import("../../../lib/db/production.js");
        const kase = await getBrandCase(String(body.id || ""));
        if (!kase) return NextResponse.json({ error: "case not found" }, { status: 404 });
        return NextResponse.json({ case: kase, events: await listBrandCaseEvents(kase.id) });
      }
      case "discover.rails.list": {
        const { listDiscoverRails } = await import("../../../lib/db/production.js");
        return NextResponse.json({ rails: await listDiscoverRails() });
      }
      case "discover.rail.update": {
        const { updateDiscoverRail } = await import("../../../lib/db/production.js");
        const rail = await updateDiscoverRail(String(body.railId || ""), {
          enabled: body.enabled, position: body.position, title: body.title });
        return rail ? NextResponse.json({ rail })
                    : NextResponse.json({ error: "rail not found (registry edits require the database)" }, { status: 404 });
      }
      case "profile.rooms.list": {
        const { listProfileRooms } = await import("../../../lib/db/production.js");
        return NextResponse.json({ rooms: await listProfileRooms({
          status: body.status === "all" ? null : (body.status || null), limit: body.limit || 100 }) });
      }
      case "profile.room.moderate": {
        const { setProfileRoomModeration } = await import("../../../lib/db/production.js");
        if (!["visible", "under_review", "hidden"].includes(body.status)) {
          return NextResponse.json({ error: "status must be visible, under_review, or hidden" }, { status: 400 });
        }
        const room = await setProfileRoomModeration(body.accountId, body.status);
        return room ? NextResponse.json({ room })
                    : NextResponse.json({ error: "room not found" }, { status: 404 });
      }
      case "moderation.list": {
        const { listModerationTasks } = await import("../../../lib/db/production.js");
        return NextResponse.json({ tasks: await listModerationTasks({
          status: body.status === "all" ? null : (body.status || "open"), limit: body.limit || 100 }) });
      }
      case "moderation.resolve": {
        const { resolveModerationTask } = await import("../../../lib/db/production.js");
        const r = await resolveModerationTask(body.id, {
          status: body.status || "resolved", resolution: body.resolution || null,
          resolvedBy: adminActor() });
        return r ? NextResponse.json({ task: r })
                 : NextResponse.json({ error: "task not found or bad status" }, { status: 400 });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "admin action failed" }, { status: 500 });
  }
}
