// lib/asterisk/margin.js
// THE MARGIN ASTERISK IS ALLOWED TO ASSUME WITHIN.
//
// Owner instruction, 24 August: "a very small margin for it to assume things."
// Written into the constitution as amendment A5. This module is the one place
// the rule is a number rather than a sentence, so a change to what counts as
// "enough to say anything about you" is one edit and not three.
//
// It was three. `signalCount < 5` in explain.js, `LOW_SIGNAL_FLOOR = 5` in
// memory.js — the same number typed twice, in files that never referenced each
// other — and `bestScore > 0.05` in taste-class.js, which measures something
// else entirely and was easy to mistake for the same rule. A floor that lives
// in three places is a floor nobody can raise.

/**
 * How many acts it takes before the system may describe a person to
 * themselves at all.
 *
 * FIVE, and the number matters less than the fact that it is one number. A
 * save, a bag, a share, a hide: five deliberate acts. Below it, ASTERISK does
 * not have a reading — it has a handful of clicks — and it says so instead of
 * dressing them up.
 */
export const EVIDENCE_FLOOR = 5;

/** Does this profile have enough behind it to be described? */
export function hasEnoughEvidence(signalCount) {
  return (Number(signalCount) || 0) >= EVIDENCE_FLOOR;
}

/**
 * Sum the acts behind a profile. One shape, because `sources` is the only
 * place the count lives and two callers were each summing it their own way.
 */
export function signalCountOf(profile) {
  return Object.values(profile?.sources || {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/**
 * WHAT TO SAY WHEN THERE IS NOT ENOUGH. Abstention is a shippable answer, and
 * this is its sentence — one string, so the same admission reads the same way
 * on every surface rather than being re-invented per page.
 */
export const NOT_ENOUGH_YET =
  "not enough yet — this is a general reading, not a personal one";

/**
 * THE HALO IS AN INFERENCE, AND AN INFERENCE IS NOT EVIDENCE.
 *
 * `learn()` bleeds a strong positive into ADJACENT tags the person never
 * touched (HALO in lib/brain/index.js). That is the system's largest single
 * assumption and it is a reasonable one for RANKING — it is how a MINIMAL
 * reader is shown an adjacent TAILORED piece rather than a wall of the same
 * thing.
 *
 * What it must never do is come back as a fact. A haloed tag presented as
 * "your taste" tells somebody they like something on the strength of the
 * system's own guess, and a second inference drawn from it compounds a guess
 * into a claim. So: fine to rank with, never to cite.
 */
export function citableTags(taste, touched) {
  const seen = touched instanceof Set ? touched : new Set(touched || []);
  const out = {};
  for (const [tag, weight] of Object.entries(taste || {})) {
    if (seen.has(tag)) out[tag] = weight;
  }
  return out;
}
