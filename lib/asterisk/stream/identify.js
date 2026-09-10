// lib/asterisk/stream/identify.js — STEP TWO and STEP FOUR: look at the piece
// and say exactly what it is; then build the deeper array of tags.
//
// The owner's order (10 Sep 2026): "reverse image search said item and try
// its best to find out what exactly it is, when it's from, and all
// information via the original manufacturer … then generate new tags that
// are much more accurate to what the listed item actually is." There is no
// public reverse-image index to call, so the identification is done by a
// vision model reading the listing's own photographs, the seller's decoded
// item specifics, the description and the price — with web search allowed
// (a few uses) to confirm a season, a collection name or an original detail
// against the house's own record. What it returns is a structured,
// schema-validated record (schema.js), capped so a model can never claim a
// confirmed identification (0.95 ceiling, ADR-007).
//
// The call goes through the official SDK. Model and effort are dials:
//   ANTHROPIC_API_KEY (or AI_PROVIDER=anthropic + AI_API_KEY)  — the key
//   ASTERISK_IDENTIFY=0          — off switch (default: on when a key exists)
//   ASTERISK_IDENTIFY_MODEL      — default claude-opus-5
//   ASTERISK_IDENTIFY_EFFORT     — low|medium|high|xhigh|max, default high
//   ASTERISK_IDENTIFY_SEARCH=0   — no web search
//   ASTERISK_IDENTIFY_IMAGES     — photographs sent, default 3, max 6
//
// Cost is measured per call from the response's usage and returned with the
// record, so the sync can report what the catalog cost to read.

import Anthropic from "@anthropic-ai/sdk";
// TRAP 164: Node resolves the SDK's "./helpers/*" export pattern by
// substituting EVERY "*" in the resolved URL — and this repo lives in a
// directory whose name starts with "*", so "@anthropic-ai/sdk/helpers/zod"
// resolves to ".../zodASILUM website…" and fails locally (fine on Vercel,
// whose path has no star). The relative file path bypasses the pattern.
import { zodOutputFormat } from "../../../node_modules/@anthropic-ai/sdk/helpers/zod.mjs";
import { IdentificationSchema, capIdentification } from "./schema.js";
import { TAGS } from "../../brain/tags.js";
import { aiConfig, aiApiKey } from "../../ai/config.js";

export const PROMPT_VERSION = "asterisk-identify-v1";
const MAX_ITERATIONS = 4;
const IDENTIFY_TIMEOUT_MS = 180_000;

// USD per million tokens: [input, output]. Cache reads are billed at a tenth
// of input, cache writes at 1.25×.
const PRICE = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
};

const truthy = (v) => v === undefined || v === "" ? null : v === "1" || v === "true";

export function identifyConfig() {
  const ai = aiConfig();
  const key = process.env.ANTHROPIC_API_KEY || (ai.provider === "anthropic" ? aiApiKey() : null);
  const flag = truthy(process.env.ASTERISK_IDENTIFY);
  return {
    hasKey: !!key,
    enabled: !!key && flag !== false,
    model: process.env.ASTERISK_IDENTIFY_MODEL || "claude-opus-5",
    effort: ["low", "medium", "high", "xhigh", "max"].includes(process.env.ASTERISK_IDENTIFY_EFFORT)
      ? process.env.ASTERISK_IDENTIFY_EFFORT : "high",
    search: truthy(process.env.ASTERISK_IDENTIFY_SEARCH) !== false,
    images: Math.max(1, Math.min(6, Number(process.env.ASTERISK_IDENTIFY_IMAGES) || 3)),
  };
}

export function identifyEnabled() { return identifyConfig().enabled; }

// Server-only; the key never leaves this function.
function makeClient() {
  const ai = aiConfig();
  const apiKey = process.env.ANTHROPIC_API_KEY || (ai.provider === "anthropic" ? aiApiKey() : null);
  if (!apiKey) throw new Error("asterisk identify: no ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey, timeout: IDENTIFY_TIMEOUT_MS, maxRetries: 2 });
}

const AESTHETICS = {
  "AVANT-GARDE": "experimental construction, deconstruction, the Antwerp and Tokyo schools",
  SEDUCTIVE: "cut to the body, sheer, slit, hardware that reads as ornament",
  STATEMENT: "one loud piece — print, colour, scale, a graphic — meant to be seen",
  TAILORED: "the suit's discipline — structured shoulders, pressed lines, dress construction",
  ARCHIVAL: "a dated, collected piece — named season, house history, a collector's object",
  MINIMAL: "reduced, quiet, plain surfaces, exact proportion",
  UTILITARIAN: "workwear and military logic — pockets, straps, hardware that does a job",
  STREETWEAR: "the graphic tee, the hoodie, sneaker culture, the drop",
  GORP: "technical outdoor — shells, fleece, trail shoes, membranes",
  INDEPENDENT: "small houses, makers, craft over label",
};

// The charter. FROZEN TEXT, cached: nothing volatile may enter it.
export const SYSTEM_PROMPT = `You are ASTERISK, the archivist of *ASILUM magazine — a fashion intelligence terminal. A marketplace listing is put in front of you: its photographs, the seller's title, the seller's own tags ("item specifics") already decoded into plain fields, the description, the price and the condition.

Your job, in order:
1. IDENTIFY THE PIECE. From the photographs first, then the words: which house, which line or diffusion label, which garment, which collection or season, which year — with an honest confidence. Read labels, hardware, stitching, proportions, hang, fabric surface, closures, lining, graphics. Distinguish a period piece from a re-issue. If the house cannot be named from evidence, say null; never guess a house from a vibe. Use web search only to confirm a season, collection or original detail against the house's own record or a serious archive; at most a few searches.
2. DECODE THE PARENT'S TAGS. For each of the seller's tags, say what it actually means about this piece (a "Theme=Cowboy" is a motif; "Outer Shell Material=Polyester" is a seller's claim; "Vintage=Yes" is a dating claim) — and where the seller is wrong, say so in the reading.
3. BUILD THE DEEPER ARRAY. Write descriptors the way a serious collector would name what they see: construction ("dagger collar", "raglan sleeve", "welt pockets", "yoke seam"), materials ("lambskin", "aged leather", "wool lining", "metal zippers", "corozo buttons"), fit ("cropped", "boxy", "high rise"), details, the era it reads as ("mid 1970s"), and the cultural references a person who loves this piece would recognize — films, records, scenes, people, subcultures ("Taxi Driver", "Led Zeppelin", "Al Pacino in Donnie Brasco", "Yokohama bosozoku", "Antwerp Six"). References must be earned by the piece's actual look and period, never decoration. Weight each descriptor by how strongly it is true of THIS piece.
4. SCORE THE TEN AESTHETICS, each 0..1, by how much of this piece belongs to each:
${TAGS.map((t) => `   ${t}: ${AESTHETICS[t]}`).join("\n")}

Rules. Evidence before claims: every identification field you fill should be supported by something you can name in "evidence". Confidence is yours to state honestly and can never mean confirmed — an authentication needs the object in hand. Never invent a season, a price or a provenance. Prefer null to a guess. Keep every string short and specific. Tags are lowercase words or short phrases.`;

function contextText(ctx) {
  const c = {
    title: ctx.title,
    seller_brand: ctx.brand || null,
    price: ctx.price != null ? `${ctx.currency || "USD"} ${ctx.price}` : null,
    condition: ctx.condition || null,
    category_path: ctx.categoryPath || null,
    seller_tags_decoded: ctx.decoded ? Object.fromEntries(Object.entries(ctx.decoded).filter(([k]) => k !== "raw" && k !== "unknown")) : null,
    seller_tags_raw: ctx.decoded?.raw || null,
    description: ctx.description ? String(ctx.description).slice(0, 2000) : null,
    photographs_sent: ctx.imageCount,
  };
  return `LISTING\n${JSON.stringify(c, null, 1)}\n\nReturn the identification record.`;
}

export function buildMessages(ctx, images) {
  const content = images.map((url) => ({ type: "image", source: { type: "url", url } }));
  content.push({ type: "text", text: contextText({ ...ctx, imageCount: images.length }) });
  return [{ role: "user", content }];
}

function costOf(model, usage) {
  const [pin, pout] = PRICE[model] || PRICE["claude-opus-5"];
  const input = (usage?.input_tokens || 0) + 1.25 * (usage?.cache_creation_input_tokens || 0) + 0.1 * (usage?.cache_read_input_tokens || 0);
  return +((input * pin + (usage?.output_tokens || 0) * pout) / 1e6).toFixed(5);
}

function lastText(message) {
  for (let i = message.content.length - 1; i >= 0; i--) {
    const block = message.content[i];
    if (block.type === "text" && block.text) return block.text;
  }
  return null;
}

/**
 * Identify one listing. ctx: { title, brand, price, currency, condition,
 * categoryPath, decoded, description, images[] }. Returns null when the step
 * is off, refused, or unparseable — the caller then keeps the deterministic
 * tags. Never throws on a model failure; throws only on misconfiguration.
 */
export async function identifyListing(ctx, { client = null, config = identifyConfig() } = {}) {
  if (!config.enabled && !client) return null;
  const anthropic = client || makeClient();
  const images = (ctx.images || []).filter((u) => /^https:\/\//.test(String(u))).slice(0, config.images);
  const messages = buildMessages(ctx, images);
  const tools = config.search ? [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }] : undefined;
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const started = Date.now();
  let message = null, iterations = 0, searched = false;
  for (; iterations < MAX_ITERATIONS; iterations++) {
    message = await anthropic.messages.create({
      model: config.model,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      ...(tools ? { tools } : {}),
      output_config: { format: zodOutputFormat(IdentificationSchema), effort: config.effort },
    });
    for (const k of Object.keys(usage)) usage[k] += message.usage?.[k] || 0;
    if (message.content.some((b) => b.type === "server_tool_use" || b.type === "web_search_tool_result")) searched = true;
    if (message.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: message.content }); continue; }
    break;
  }
  const base = { model: config.model, promptVersion: PROMPT_VERSION, usage, costUsd: costOf(config.model, usage), searched, iterations: iterations + 1, latencyMs: Date.now() - started };
  if (!message || message.stop_reason === "refusal") return { ...base, record: null, status: "refused" };
  const text = lastText(message);
  if (!text) return { ...base, record: null, status: "empty" };
  let parsed;
  try { parsed = IdentificationSchema.safeParse(JSON.parse(text)); } catch { return { ...base, record: null, status: "unparseable" }; }
  if (!parsed.success) return { ...base, record: null, status: "invalid" };
  return { ...base, record: capIdentification(parsed.data), status: "ok" };
}
