// app/api/suggest/route.js
// GET /api/suggest?q=<partial> — search autocomplete: 3–10 suggestions when
// possible (corrected spellings, related fashion terms, designers, and
// "like <designer>"). Basic fuzzy matching, no AI, no logging (typing is not
// a committed search).

import { NextResponse } from "next/server";
import { TAGS } from "../../../lib/brain/tags.js";
import { getProductPool } from "../../../lib/search/index.js";
import { listSearchMappings } from "../../../lib/db/production.js";
import { DEFAULT_MAPPINGS } from "../../../lib/search/mappings-seed.js";
import { buildVocabulary, suggest } from "../../../lib/search/suggest.js";

export const dynamic = "force-dynamic";

let _vocab = null, _vocabAt = 0;
const VOCAB_TTL = 5 * 60 * 1000; // brands change on ingest, not per keystroke

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ q, suggestions: [] });

  try {
    if (!_vocab || Date.now() - _vocabAt > VOCAB_TTL) {
      const pool = await getProductPool();
      let mappings = [];
      try { mappings = await listSearchMappings(); } catch { mappings = []; }
      _vocab = buildVocabulary(pool, mappings.length ? mappings : DEFAULT_MAPPINGS, TAGS);
      _vocabAt = Date.now();
    }
    return NextResponse.json({ q, suggestions: suggest(q, _vocab) });
  } catch {
    return NextResponse.json({ q, suggestions: [] });
  }
}
