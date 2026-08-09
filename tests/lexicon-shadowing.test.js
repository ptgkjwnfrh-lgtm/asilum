// tests/lexicon-shadowing.test.js
// The brain owns TWO curated vocabularies — the knowledge base (kb.js) and
// the lexicon (lexicon.js) — and resolveToken must consult them in the right
// order. The bug this guards: resolveToken called the COMBINED kbResolve
// (exact hit OR fuzzy substring) before lexiconVector, so any lexicon word
// that merely sat inside a KB key lost its own meaning to that key. "white"
// resolved through "off white" to STREETWEAR/STATEMENT/AVANT-GARDE at weight
// 1.0 instead of the curated MINIMAL 0.6 / TAILORED 0.3.
//
// Law: a test that never leaves the file it guards cannot catch a
// disagreement between two files. So the primary assertion here is a
// MECHANICAL DIFF of the two tables — it fails on any future entry added to
// either one that would re-create the shadow, not just on today's 33.

import test from "node:test";
import assert from "node:assert/strict";

import { kbResolve, kbResolveExact, kbResolveFuzzy } from "../lib/brain/kb.js";
import { LEXICON, lexiconVector } from "../lib/brain/lexicon.js";
import { resolveToken, deduceProduct } from "../lib/brain/index.js";

test("no curated LEXICON word is shadowed by a FUZZY knowledge-base match", () => {
  const shadowed = [];
  for (const word of Object.keys(LEXICON)) {
    // An EXACT KB hit is intended precedence — designers stay authoritative
    // over the looser tables. Only a fuzzy substring hit is the defect.
    if (kbResolveExact(word)) continue;
    const near = kbResolveFuzzy(word);
    if (!near) continue;
    const got = resolveToken(word);
    const want = lexiconVector(word);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      shadowed.push(`"${word}" resolved via KB "${near.key}" instead of its own lexicon entry`);
    }
  }
  assert.deepEqual(shadowed, [], `lexicon entries lost to the fuzzy KB bridge:\n${shadowed.join("\n")}`);
});

test("the words the bug actually corrupted read from the lexicon again", () => {
  // Wrong-tag cases: the KB match changed what the word MEANS.
  assert.deepEqual(resolveToken("white"), { MINIMAL: 0.6, TAILORED: 0.3 });
  assert.deepEqual(resolveToken("lace"), { SEDUCTIVE: 0.7, STATEMENT: 0.3, ARCHIVAL: 0.2 });
  assert.deepEqual(resolveToken("shell"), { GORP: 0.6, UTILITARIAN: 0.5 });
  assert.deepEqual(resolveToken("tweed"), { TAILORED: 0.6, ARCHIVAL: 0.4 });

  // Weight-inflation cases: right tags, but tagsToVec stamped every one at
  // 1.0, so a city name outvoted a curated aesthetic term.
  assert.deepEqual(resolveToken("paris"), { TAILORED: 0.6, "AVANT-GARDE": 0.5, SEDUCTIVE: 0.4 });
  assert.deepEqual(resolveToken("military"), { UTILITARIAN: 0.7, ARCHIVAL: 0.4 });
});

test("exact knowledge-base hits still win over the lexicon", () => {
  // "gorp" is in BOTH tables; the KB is authoritative on an exact key.
  const kb = kbResolveExact("gorp");
  assert.ok(kb, "gorp must still be an exact KB key");
  const got = resolveToken("gorp");
  for (const tag of kb.tags) assert.equal(got[tag], 1, `exact KB hit must stamp ${tag} at 1`);
});

test("the fuzzy bridge still resolves tokens the lexicon does not own", () => {
  // Removing the shadow must not remove the bridge: a near-miss on a KB key
  // with no lexicon entry of its own still resolves.
  assert.equal(Object.prototype.hasOwnProperty.call(LEXICON, "margiel"), false);
  const near = kbResolveFuzzy("margiel");
  assert.ok(near, "fuzzy bridge should still reach a KB key");
  assert.ok(Object.keys(resolveToken("margiel")).length > 0, "bridged token must still resolve");
  // And the combined helper is unchanged for callers that want both phases
  // (lib/tagging/dense.js resolves brand strings this way).
  assert.deepEqual(kbResolve("margiel"), near);
  assert.deepEqual(kbResolve("gorp"), kbResolveExact("gorp"));
});

// deduceProduct and zeroVec return DENSE vectors (every tag key, most at 0);
// lexiconVector returns a sparse one. Compare on the non-zero entries.
const nz = (v) => Object.fromEntries(Object.entries(v || {}).filter(([, x]) => x));

test("the bigram path takes the lexicon reading too", () => {
  // "new york" is not an exact KB key ("new york city" is), so before the fix
  // the bigram fuzzy-matched and took all three tags at 1.0.
  assert.deepEqual(nz(deduceProduct(["new", "york"])), nz(lexiconVector("new york")));
  // A phrase built from a corrupted word now trains the right thing: "white
  // tee" was training Off-White streetwear.
  const whiteTee = deduceProduct(["white", "tee"]);
  assert.ok(whiteTee.MINIMAL > 0, "white tee must read MINIMAL");
  assert.ok(!whiteTee.STREETWEAR, "white tee must not read STREETWEAR");
});

test("morphology's compound split only accepts genuinely exact halves", () => {
  // The split promises "both halves must be exactly known". With the fuzzy
  // bridge inside exactVector it did not: "tailored" split into "tailo"
  // (inside the film "tinker tailor") + "red", inventing a reading. It must
  // now decline rather than invent one.
  assert.deepEqual(nz(resolveToken("tailored")), {});
  // Likewise "jeans" -> "jean" must no longer reach "jean paul gaultier".
  assert.deepEqual(nz(resolveToken("jeans")), {});
});
