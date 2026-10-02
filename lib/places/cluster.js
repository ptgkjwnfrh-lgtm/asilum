// lib/places/cluster.js — CLUSTER OVERLAPPING MARKERS (V.2 brief §11). Pure
// and client-safe: screen-space pins in, clusters out, the same input giving
// the same clusters so a test can hold it.
//
// A greedy radius cluster in screen pixels: pins are visited in a stable
// order (by y, then x, then id) and each joins the first cluster whose
// centre is within RADIUS px, else starts one. A cluster of one is the pin
// itself. The map draws a cluster as a count; selecting it expands its
// members in place (the next render receives `expanded` ids and leaves
// those pins alone). Camera, zoom and layers are untouched by any of this —
// clustering reads positions, it never moves them.

export const CLUSTER_RADIUS_PX = 22;

/**
 * @param pins   [{ id, x, y, ...rest }] in screen px
 * @param opts   { radius, expanded: Set<clusterId> }
 * @returns      [{ id, kind: "pin"|"cluster", x, y, count, members: [pin] }]
 */
export function clusterPins(pins = [], { radius = CLUSTER_RADIUS_PX, expanded = new Set() } = {}) {
  const sorted = [...pins].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
  const clusters = [];
  for (const p of sorted) {
    let home = null;
    for (const c of clusters) {
      const dx = c.cx - p.x, dy = c.cy - p.y;
      if (dx * dx + dy * dy <= radius * radius) { home = c; break; }
    }
    if (!home) { clusters.push({ members: [p], cx: p.x, cy: p.y }); continue; }
    home.members.push(p);
    // the centre is the running mean, so a chain cannot drift past the radius from its first pin by much
    home.cx = home.members.reduce((s, m) => s + m.x, 0) / home.members.length;
    home.cy = home.members.reduce((s, m) => s + m.y, 0) / home.members.length;
  }
  const out = [];
  for (const c of clusters) {
    if (c.members.length === 1) { out.push({ id: String(c.members[0].id), kind: "pin", x: c.members[0].x, y: c.members[0].y, count: 1, members: c.members }); continue; }
    const id = "cluster:" + c.members.map((m) => m.id).sort().join("|");
    if (expanded.has(id)) {
      // spread the members on a small ring so each is tappable; positions only, never data
      const r = radius + 4;
      c.members.forEach((m, k) => { const a = (2 * Math.PI * k) / c.members.length; out.push({ id: String(m.id), kind: "pin", x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r, count: 1, members: [m], ofCluster: id }); });
      continue;
    }
    out.push({ id, kind: "cluster", x: c.cx, y: c.cy, count: c.members.length, members: c.members });
  }
  return out;
}
