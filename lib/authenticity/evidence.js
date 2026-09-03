// lib/authenticity/evidence.js — WHAT WE COULD SEE. Never a verdict.
//
// ── WHY THIS IS NOT A "REP CHECKER" ─────────────────────────────────────────
//
// The owner asked for a cloned AI replica checker. It cannot be cloned and it
// should not be built, and the reason is the owner's own first law rather than
// squeamishness:
//
//   * Entrupy's product is a MICROSCOPE. The hardware is the method.
//   * CheckCheck and LegitGrails are networks of human experts.
//   * None publish weights, datasets or methods.
//   * And a model that prints "authentic — 94%" from a phone photograph is
//     GUESSING, about a purchase, where being wrong costs a reader real money.
//
// ASTERISK may only reason from what it can point at. So this reports EVIDENCE
// and leaves the conclusion where it belongs — with the person spending the
// money. It never uses the words "authentic", "genuine", "fake" or "replica",
// and there is a test that fails if it starts.
//
// ── AND IT IS INVISIBLE (docs/INVISIBLE-MACHINERY.md) ───────────────────────
//
// There is no "check this" button. Evidence surfaces only where a reader is
// about to need it — which the owner already defined: where the price is high
// relative to what would justify it, because that is where the unchecked name
// is most of what is being bought. `stakeOf` in lib/provenance.js holds that
// ladder and this module reads it.
//
// Below that, total silence. Not a collapsed panel, not a grey tick — nothing.
//
// ── THE ONE PLACE SILENCE IS WRONG ──────────────────────────────────────────
//
// Invisible machinery says "no empty state". Coverage looks like an empty
// state and is not, and the distinction is worth being precise about:
//
//   * At LOW stake the feature does not exist for this reader. Silence.
//   * At HIGH stake the reader is about to pay for a claim. Telling them we
//     could look at one thing out of five is not ceremony — it IS the finding,
//     and withholding it hides a consequence. INVISIBLE-MACHINERY forbids
//     exactly that: the law governs MECHANISM, never CONSEQUENCE.
//
// ── ADDING A SIGNAL (this is built to be extended) ──────────────────────────
//
// Append to SIGNALS. A signal with `read: null` is DECLARED BUT UNBUILT — it
// is reported as "not checked" with the reason from `needs`, which is honest
// today and becomes the implementation checklist later. Filling one in is
// writing one function; nothing else changes.
//
// A `read` returns `{ said }` when it has something TRUE to state, or null for
// silence. It must never return a score, a percentage or a verdict.

import { stakeOf, STAKE_HIGH, STAKE_MATERIAL } from "../provenance.js";
import { findImageCollisions, imageFingerprintFor } from "../db/imageFingerprints.js";

/**
 * Every check, built or not.
 *
 * `needs` is written for a READER, not a developer — it becomes the sentence
 * explaining why something could not be looked at.
 */
export const SIGNALS = [
  {
    id: "image-reuse",
    needs: "a readable photograph on the listing",
    // BUILT. Real evidence: a pixel computation over images we already hold.
    // Reused photography is the oldest signal there is — a seller who did not
    // photograph the thing they are selling may have a reason, and the reader
    // is the one who gets to decide what it is.
    async read(item) {
      const own = await imageFingerprintFor(item.id);
      if (!own?.dhash) return null; // never fingerprinted — "not checked"
      const hits = await findImageCollisions(own.dhash, { excludeSource: own.sourceName });
      const elsewhere = hits.filter((h) => h.itemId !== item.id);
      if (!elsewhere.length) return null; // nothing to say; say nothing
      const n = elsewhere.length;
      return {
        said: n === 1
          ? "this photograph is also on another listing."
          : `this photograph is also on ${n} other listings.`,
        items: elsewhere.slice(0, 4).map((h) => h.itemId),
      };
    },
  },
  {
    id: "seller-declaration",
    needs: "a listing that says something about its own origin",
    // BUILT. The strongest authenticity evidence readable from a listing
    // without touching the garment, and it is not an inference — the seller
    // wrote it.
    //
    // Japanese resale states this openly in a way English listings rarely do:
    // 「スーパーコピー」, 「レプリカ」, 「偽物」. lib/ingest/japan/read.js reads
    // those into `sellerClaim`.
    //
    // ONLY THE ADMISSION IS REPORTED. A seller asserting 「正規品」 (genuine)
    // is worth nothing — anybody can type it, and repeating it back would turn
    // a claim into an endorsement. An admission AGAINST INTEREST is different
    // in kind, which is exactly why one direction speaks and the other does
    // not.
    async read(item) {
      if (item?.sellerClaim !== "declared-replica") return null;
      return { said: "the seller describes this listing as a copy." };
    },
  },
  {
    id: "price-position",
    needs: "at least three comparable pieces in the archive",
    // ROADMAP §4.6. Deliberately unbuilt: an invented "market value" is the
    // exact guess the first law forbids, and a comparison drawn from one or
    // two pieces is noise wearing a number.
    read: null,
  },
  {
    id: "house-tells",
    needs: "a reference held for this house and era",
    // The archivalist reference library — tag fonts, stitch, hardware, serial
    // formats, with images, written and signed by a person. This is the real
    // work and it is human work, not a model.
    read: null,
  },
  {
    id: "seller-history",
    needs: "a licensed marketplace feed carrying seller data",
    // Blocked on the Buyee/ZenMarket agreements (ROADMAP §4.4), not on code.
    read: null,
  },
  {
    id: "detail-coverage",
    needs: "the close-up photographs a check would need",
    // Which required photographs the listing carries at all. Cheap, honest,
    // and worth building alongside house-tells, which it feeds.
    read: null,
  },
];

/** Stakes at which a reader is owed the coverage line, not just silence. */
const SPEAKS_AT = new Set([STAKE_MATERIAL, STAKE_HIGH]);

/**
 * Read the evidence for one piece.
 *
 * Returns null — the whole feature absent — unless the stake is real. When it
 * speaks it returns `{ observations, checked, total, notChecked }`, where
 * `observations` are things that are TRUE and `notChecked` names what could
 * not be looked at and why.
 *
 * Never throws. A signal that fails is counted as not checked, because an
 * error is a thing we could not see, not a thing we found.
 */
export async function readEvidence(item) {
  if (!item) return null;
  const stake = stakeOf(item);
  if (!SPEAKS_AT.has(stake.level)) return null;

  const observations = [];
  const notChecked = [];
  let checked = 0;

  for (const signal of SIGNALS) {
    if (typeof signal.read !== "function") {
      notChecked.push({ id: signal.id, needs: signal.needs });
      continue;
    }
    try {
      const found = await signal.read(item);
      checked += 1;
      if (found?.said) observations.push({ id: signal.id, ...found });
    } catch {
      notChecked.push({ id: signal.id, needs: signal.needs });
    }
  }

  return { observations, checked, total: SIGNALS.length, notChecked, stake: stake.level };
}
