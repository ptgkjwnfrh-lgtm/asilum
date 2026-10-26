// lib/feed/blocks.js — THE BLOCKS (owner, 25 Oct 2026: "fuck the chevrons —
// use this image to replace the chevrons, I want them used as text place
// holders"; the reference, Ref 1 and Ref 2: a row of even blocks, and a row
// of blocks of varying lengths, like the words of a redacted line). They
// replace the ">>>>>>" of 18 Oct everywhere text stood in for text:
//
//   the FRAME of text loading in (blockFrame; app/components/Blocks.jsx
//   BlockText draws it) — the text arrives behind a run of even blocks
//   (Ref 1) sweeping left to right; the run is the next characters
//   themselves, drawn as blocks, so nothing reflows as it arrives;
//
//   a FOLDED line (blockWords; BlockLine draws it) — every word a block of
//   its own width (Ref 2), the caption waiting inside.
//
// Pure and isomorphic.

export const BLOCK_RUN = 6;

/** The three parts of the frame at `n` characters revealed: what is shown,
 *  the next characters standing in as blocks (never more than the run, never
 *  past the end), what is still to come. Together they are always exactly
 *  the text, so nothing reflows as it arrives. */
export function blockFrame(text, n, run = BLOCK_RUN) {
  const t = String(text ?? "");
  const shown = t.slice(0, Math.max(0, Math.floor(n) || 0));
  const k = Math.max(0, Math.min(run, t.length - shown.length));
  return { shown, run: t.slice(shown.length, shown.length + k), rest: t.slice(shown.length + k) };
}

/** The words of a line, each to be drawn as a block of its own width. */
export function blockWords(text) {
  return String(text ?? "").split(/\s+/).filter(Boolean);
}
