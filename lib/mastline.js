// lib/mastline.js — THE MASTHEAD'S LINE, broken at the keys (owner, 28 Oct
// 2026: "the line that stretches the mast head should reach to the end of
// the hit box of the passport button. also the line should sit under the
// thick logo line … the stretched mast head line should break at the gap
// points of the buttons and there should be faint lines in between the
// buttons like on the center fixture"). app/components/Masthead.jsx
// measures the keys and draws what this returns.
//
// From the logo's left edge to the last key's right edge (the Passport's hit
// box): one stretch under the logo up to the first key, then one under each
// key, each broken from the next where two hit boxes meet (`gl` / `gr`: a
// half break on that side; the CSS sizes the break, --mh-break). A faint
// cut stands at each meeting of two keys — between keys only.

/** @param {number} start the logo's left edge
 *  @param {{left:number,right:number}[]} keys the keys' hit boxes, in the same space
 *  @returns {{segs:{a:number,b:number,gl:0|1,gr:0|1}[], cuts:number[]}} */
export function mastLine(start, keys) {
  const ks = (keys || []).filter((k) => k && Number.isFinite(k.left) && k.right > k.left).sort((p, q) => p.left - q.left);
  if (!ks.length || !Number.isFinite(start)) return { segs: [], cuts: [] };
  const segs = [];
  if (ks[0].left > start) segs.push({ a: start, b: ks[0].left, gl: 0, gr: 1 });
  ks.forEach((k, i) => segs.push({ a: Math.max(k.left, start), b: k.right, gl: 1, gr: i < ks.length - 1 ? 1 : 0 }));
  const cuts = ks.slice(0, -1).map((k, i) => (k.right + ks[i + 1].left) / 2);
  return { segs, cuts };
}

/** Whether two lines draw the same (to the half pixel). */
export function sameLine(p, q) {
  if (!p || !q || p.segs.length !== q.segs.length || p.cuts.length !== q.cuts.length) return false;
  const near = (x, y) => Math.abs(x - y) < 0.5;
  return p.segs.every((s, i) => near(s.a, q.segs[i].a) && near(s.b, q.segs[i].b) && s.gl === q.segs[i].gl && s.gr === q.segs[i].gr)
    && p.cuts.every((c, i) => near(c, q.cuts[i]));
}
