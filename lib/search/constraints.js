// lib/search/constraints.js — THE FILTERS NOBODY SET.
//
// ── WHY THERE ARE NO FILTER CONTROLS ────────────────────────────────────────
//
// The competitor gives you four dropdowns: brand, category, source, price. You
// operate the dashboard, and the dashboard gives you rows.
//
// ASILUM already lifts constraints out of the sentence. "1990s helmut lang
// size L not leather" is parsed into an era, a house, a size and an exclusion
// before a single product is scored — that is what lib/search/interpret.js and
// the constraint family (era, origin, size, negation, designers) do. So the
// filters exist; there is simply nothing to click, because the reader already
// said what they meant.
//
// Adding dropdowns on top would be building a second way to say the same
// thing, and the two would drift. docs/INVISIBLE-MACHINERY.md.
//
// ── THE GAP THIS FILLS, AND IT IS A REAL ONE ────────────────────────────────
//
// A constraint the reader never set is still a constraint they may want gone.
// Ask for "japanese wool coat under 400", get nothing, and today the only way
// to loosen it is to retype the sentence and guess which word was the problem.
//
// So: every constraint is shown, and every one can be RELEASED. That is not a
// filter control — nothing here creates a constraint. It reveals what the
// sentence already made and lets a reader take one back.
//
// ── RELEASE REWRITES THE QUERY, NOT THE ENGINE ──────────────────────────────
//
// Releasing a constraint removes the WORDS that created it and re-runs the
// ordinary search. There is no "drop this constraint" path through the engine,
// so there is no second code path to diverge from the first: the sentence
// stays the single source of truth, and the URL keeps being the whole state.

/** The constraint kinds a sentence can carry, in the order a reader met them. */
const KINDS = ["brand", "designerCredit", "era", "origin", "size", "priceSort", "exclusions"];

/** Words that introduce an exclusion, so releasing one takes the "not" with it. */
const NEGATORS = ["not", "no", "without", "except", "excluding", "minus"];

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * What this sentence turned into: `[{ kind, label, phrase, releasable }]`.
 *
 * `phrase` is the text that produced the constraint, and it is what release
 * removes. When a constraint carries no recoverable phrase it is still SHOWN —
 * a reader seeing what was understood is the point — but `releasable` is false
 * rather than the chip silently doing nothing when pressed.
 */
export function readConstraints(interpreted = {}) {
  const out = [];
  for (const kind of KINDS) {
    const value = interpreted[kind];
    if (!value) continue;

    if (kind === "exclusions") {
      for (const word of value) {
        if (!word) continue;
        out.push({ kind, label: `not ${word}`, phrase: String(word), releasable: true });
      }
      continue;
    }
    if (kind === "brand" || kind === "designerCredit") {
      out.push({ kind, label: String(value), phrase: String(value), releasable: true });
      continue;
    }
    // era / origin carry `words`; size / priceSort carry `phrase`.
    const phrase = Array.isArray(value.words) ? value.words.join(" ") : value.phrase;
    const label = value.label || value.phrase
      || (Array.isArray(value.words) ? value.words.join(" ") : null);
    if (!label) continue;
    out.push({
      kind,
      label: String(label),
      phrase: phrase ? String(phrase) : null,
      releasable: Boolean(phrase),
    });
  }
  return out;
}

/**
 * The same sentence with one constraint's words taken out.
 *
 * Returns the original query unchanged when the constraint cannot be released,
 * so a caller can hand back whatever it gets without checking — a no-op is a
 * safe outcome, a mangled query is not.
 *
 * An exclusion takes its negator with it: removing just "leather" from "not
 * leather" would leave a dangling "not" that the parser then reads as part of
 * the next phrase.
 */
export function releaseConstraint(query, constraint) {
  const q = clean(query);
  if (!q || !constraint?.releasable || !constraint.phrase) return q;
  const phrase = clean(constraint.phrase);
  if (!phrase) return q;

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const negators = NEGATORS.join("|");
  // An exclusion is "not leather" / "no leather"; anything else is the phrase
  // on its own. Word boundaries keep "no" out of "nordic".
  const pattern = constraint.kind === "exclusions"
    ? new RegExp(`(?:\\b(?:${negators})\\s+)?\\b${escaped}\\b`, "gi")
    : new RegExp(`\\b${escaped}\\b`, "gi");

  const next = clean(q.replace(pattern, " "));
  // Never hand back an empty search. If releasing would erase the whole
  // sentence there is nothing left to ask, so the release does not happen.
  return next || q;
}

/**
 * True when the sentence carried anything worth showing back.
 *
 * The caller renders nothing at all when this is false — an empty constraint
 * row is the empty state the third law forbids, and it would also advertise
 * that a filter mechanism exists at all.
 */
export function hasConstraints(interpreted = {}) {
  return readConstraints(interpreted).length > 0;
}
