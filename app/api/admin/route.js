// app/api/admin/route.js
// Admin/moderation backend — no public UI yet (deliberate: the public design
// is locked; a full admin page can mount on these functions later).
//
// Auth: ADMIN_TOKEN env var; requests send "Authorization: Bearer <token>".
// Unset token = admin disabled entirely (503, honest error).
//
// GET  ?area=overview|tags|mappings|sync-logs|search-logs|tickets|adapters
// POST { action, ... }:
//   tag.add    { productId, tag, tagType?, confidence? }
//   tag.delete { id }
//   tag.merge  { from, to }
//   mapping.upsert { searchPhrase, mappedTags, relatedTerms, referenceType?, confidence? }
//   mapping.delete { searchPhrase }
//   product.moderate { productId, status: visible|hidden|flagged }
//   sync.run   { query?, limit? }

import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db/index.js";
import {
  getProductTags, addProductTags, deleteProductTag, mergeProductTags,
  listSearchMappings, upsertSearchMapping, deleteSearchMapping,
  listSyncLogs,
} from "../../../lib/db/production.js";
import { adapterStatuses } from "../../../lib/ingest/adapters/index.js";

export const dynamic = "force-dynamic";

function authed(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) return { ok: false, status: 503, error: "admin disabled — set ADMIN_TOKEN (16+ chars)" };
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (got !== token) return { ok: false, status: 401, error: "bad admin token" };
  return { ok: true };
}

export async function GET(req) {
  const gate = authed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") || "overview";
  const p = await getPool();

  try {
    if (area === "adapters") return NextResponse.json({ adapters: adapterStatuses() });
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
  } catch (e) {
    return NextResponse.json({ error: String(e.message).slice(0, 200) }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = authed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  let body = {};
  try { body = await req.json(); } catch {}

  try {
    switch (body.action) {
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
        const status = ["visible", "hidden", "flagged"].includes(body.status) ? body.status : "visible";
        const r = await p.query(
          "UPDATE items SET moderation_status=$2, flagged=($2='flagged'), updated_at=now() WHERE id=$1",
          [body.productId, status]
        );
        return NextResponse.json({ moderated: r.rowCount });
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
        const r = await reviewFact(body.id, body.status, body.reviewer || null);
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
      case "moderation.list": {
        const { listModerationTasks } = await import("../../../lib/db/production.js");
        return NextResponse.json({ tasks: await listModerationTasks({
          status: body.status === "all" ? null : (body.status || "open"), limit: body.limit || 100 }) });
      }
      case "moderation.resolve": {
        const { resolveModerationTask } = await import("../../../lib/db/production.js");
        const r = await resolveModerationTask(body.id, {
          status: body.status || "resolved", resolution: body.resolution || null,
          resolvedBy: body.resolvedBy || "admin" });
        return r ? NextResponse.json({ task: r })
                 : NextResponse.json({ error: "task not found or bad status" }, { status: 400 });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e.message).slice(0, 200) }, { status: 500 });
  }
}
