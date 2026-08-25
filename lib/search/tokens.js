// lib/search/tokens.js — HOW A QUERY BECOMES WORDS.
//
// Two lines of code carrying two hard-won rules, which is exactly why they
// live in one place instead of being re-typed at each call site: every layer
// of the engine must cut a sentence into words the SAME way, or a token that
// exists during interpretation vanishes during ranking.

import { foldNorm } from "./text.js";

// Accent-folded (lib/search/text.js): "garcons" must reach "Garçons", and
// "Garçons" must still reach itself. Both sides of every comparison fold.
export const norm = (s) => foldNorm(s);
// A SINGLE DIGIT IS A WORD (Aug 22). The filter was `length > 1`, which
// deleted every one-digit number before anything could parse it OR report it
// — "show me 5 jackets" could not even say it had ignored the 5. Digits
// survive now; letters of length 1 still do not, because a stray "a" or "s"
// is noise rather than a number somebody typed.
export const tokens = (s) => norm(s).split(/[^a-z0-9]+/)
  .filter((t) => t.length > 1 || /^[0-9]$/.test(t));
