"use client";

// app/components/PassportBadge.jsx — ONE STAMP as a medal (owner, 3 Nov 2026: "different shapes in relation
// to what they mean … semi resemble the apple fitness badges"), in the house's register — sleek, luminous,
// restrained. The silhouette is the meaning's (lib/passport/badges.js); the body a metal of the stamp's own
// token (the logo's white over it at the top, the ground under it at the foot), a darker face inset, the
// emblem engraved on the face, a hairline rim. Not earned: the silhouette in grey, the face dark, the emblem
// faint — Apple's locked badge, ours. Used flat on the visa page and, layered, as the space zone's coin.
// Colour only through tokens (currentColor); the glow is --glow-mark (none in the light palette).

import { useId } from "react";
import { shapePath } from "../../lib/passport/badges.js";

// the emblem's fine lines, per shape, under the text
function Lines({ shape }) {
  if (shape === "globe") return (
    <g className="ppbadgeline">
      <ellipse cx="60" cy="60" rx="18" ry="40" /><ellipse cx="60" cy="60" rx="34" ry="40" />
      <path d="M22,46 H98 M22,74 H98 M60,20 V100" />
    </g>
  );
  if (shape === "gem") return <g className="ppbadgeline"><path d="M14,42 H106 M34,16 L46,42 L60,104 L74,42 L86,16 M60,16 V16" /></g>;
  if (shape === "ticket") return <g className="ppbadgeline"><path d="M82,32 V88" strokeDasharray="2 3" /></g>;
  if (shape === "tag") return <circle className="ppbadgehole" cx="60" cy="27" r="5" />;
  return null;
}

export default function PassportBadge({ shape, emblem, small, earned = true, ink = "sig", className = "" }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const d = shapePath(shape);
  const long = String(emblem || "").length;
  const size = long <= 2 ? 30 : long <= 3 ? 24 : long <= 4 ? 19 : 15;
  return (
    <svg className={"ppbadge ink-" + ink + (earned ? " earned" : " locked") + (className ? " " + className : "")} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={id + "m"} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" className="m0" /><stop offset="0.42" className="m1" /><stop offset="0.58" className="m2" /><stop offset="1" className="m3" />
        </linearGradient>
        <linearGradient id={id + "f"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="f0" /><stop offset="1" className="f1" />
        </linearGradient>
        <linearGradient id={id + "s"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" className="s0" /><stop offset="0.45" className="s1" /><stop offset="0.6" className="s0" />
        </linearGradient>
        <clipPath id={id + "c"}><path d={d} /></clipPath>
      </defs>
      <path className="ppbadgebody" d={d} fill={`url(#${id}m)`} />
      <path className="ppbadgeface" d={d} fill={`url(#${id}f)`} transform="translate(60 60) scale(0.84) translate(-60 -60)" />
      <g clipPath={`url(#${id}c)`} transform="translate(60 60) scale(0.84) translate(-60 -60)"><Lines shape={shape} /></g>
      {earned && <rect className="ppbadgesheen" x="0" y="0" width="120" height="120" fill={`url(#${id}s)`} clipPath={`url(#${id}c)`} />}
      <path className="ppbadgerim" d={d} />
      {emblem && <text className="ppbadgeemblem" x="60" y={small ? 56 : 62} fontSize={size} textAnchor="middle" dominantBaseline="middle">{emblem}</text>}
      {small && <text className="ppbadgesmall" x="60" y="80" textAnchor="middle" dominantBaseline="middle">{small}</text>}
    </svg>
  );
}
