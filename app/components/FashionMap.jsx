"use client";

// app/components/FashionMap.jsx — the local and global fashion map, drawn
// (V.2). A SCHEMATIC, on purpose: no tile service, no street map — the
// repo has no map library and the rights register keeps it that way. Local
// mode is a radar: the base city (or the current area) at the centre,
// distance rings, every place a pin at its true bearing and distance. World
// mode is an equirectangular plate with the graticule. It is honest about
// being a diagram, and it is exactly what a public Passport may draw when
// the city is hidden: a ring with no recognizable streets.
//
// Pins are real controls (keyboard, aria) and a sample pin is dashed.

const W = 800, H = 520;
const GLYPH = { runway: "R", "pop-up": "P", consignment: "C", thrift: "T", shop: "S", exhibition: "E", creator: "◉" };

function localProject(center, p, km) {
  const kmPerPx = km / (Math.min(W, H) / 2 - 24);
  const dx = (p.lng - center.lng) * 111.32 * Math.cos((center.lat * Math.PI) / 180);
  const dy = (p.lat - center.lat) * 110.57;
  return { x: W / 2 + dx / kmPerPx, y: H / 2 - dy / kmPerPx };
}
function worldProject(p) {
  return { x: ((p.lng + 180) / 360) * W, y: ((90 - p.lat) / 180) * H };
}

export default function FashionMap({ mode = "local", center = null, km = 30, places = [], selectedId = null, onSelect, label = "" }) {
  const local = mode === "local" && center && Number.isFinite(center.lat);
  const pins = places
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ p, at: local ? localProject(center, p, km) : worldProject(p) }))
    .filter(({ at }) => at.x > -20 && at.x < W + 20 && at.y > -20 && at.y < H + 20);
  const rings = local ? [km / 3, (2 * km) / 3, km] : [];
  const kmPerPx = local ? km / (Math.min(W, H) / 2 - 24) : 0;
  return (
    <svg className={"fmap " + mode} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={local ? `schematic map around ${label || "your base city"}, ${km} km across` : "schematic world map"}>
      <rect x="0" y="0" width={W} height={H} className="fmapbg" />
      {local ? (
        <>
          {rings.map((r) => (
            <g key={r}>
              <circle cx={W / 2} cy={H / 2} r={r / kmPerPx} className="fmapring" />
              <text x={W / 2 + r / kmPerPx + 4} y={H / 2 - 4} className="fmapringlbl">{Math.round(r)} KM</text>
            </g>
          ))}
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} className="fmapaxis" />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="fmapaxis" />
          <text x={W / 2} y={16} textAnchor="middle" className="fmapringlbl">N</text>
          <circle cx={W / 2} cy={H / 2} r={5} className="fmapyou" />
          <text x={W / 2 + 10} y={H / 2 + 16} className="fmapyoulbl">{label || "BASE CITY"}</text>
        </>
      ) : (
        <>
          {[-60, -30, 0, 30, 60].map((lat) => <line key={"la" + lat} x1={0} y1={((90 - lat) / 180) * H} x2={W} y2={((90 - lat) / 180) * H} className={"fmapgrid" + (lat === 0 ? " eq" : "")} />)}
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => <line key={"lo" + lng} x1={((lng + 180) / 360) * W} y1={0} x2={((lng + 180) / 360) * W} y2={H} className={"fmapgrid" + (lng === 0 ? " eq" : "")} />)}
          <text x={8} y={H - 8} className="fmapringlbl">EQUIRECTANGULAR · SCHEMATIC · CITY AREAS ONLY</text>
        </>
      )}
      {pins.map(({ p, at }) => {
        const sel = selectedId === p.id;
        return (
          <g key={p.id} className={"fmappin" + (p.sample ? " sample" : "") + (sel ? " sel" : "") + " " + p.kind}
             tabIndex={0} role="button" aria-pressed={sel} aria-label={`${p.name} — ${p.kind}${p.sample ? ", sample fixture" : ""}${p.distanceKm != null ? `, ${p.distanceKm} km` : ""}`}
             onClick={() => onSelect && onSelect(p.id)}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect && onSelect(p.id); } }}>
            <circle cx={at.x} cy={at.y} r={sel ? 14 : 11} className="fmapdot" />
            <text x={at.x} y={at.y + 4} textAnchor="middle" className="fmapglyph">{GLYPH[p.kind] || "•"}</text>
            {(sel || pins.length <= 5) && <text x={at.x + 16} y={at.y + 4} className="fmapname">{p.name}</text>}
          </g>
        );
      })}
    </svg>
  );
}
