"use client";

// app/components/ProductSignals.jsx — the small honest signals on a piece:
// what colour it VERIFIABLY is, and how it would fit the reader.
//
// Both are claims about the physical garment, so both refuse to guess. A
// colour line appears only where the merchant listing and the product images
// AGREE; a fit line appears only where a size can be read. Rendering nothing
// is the correct output for "we do not know" — a swatch nobody verified is
// worse than no swatch, because a reader buys against it.


import { useEffect, useState } from "react";
import { fitPhrase } from "../../lib/brain/sizing.js";
import {
  fitProfileForBrain, getUid, loadFitProfile, loadServerFitProfile, saveFitProfile,
} from "../../lib/client.js";

// Shared, deliberately conspicuous product facts. Color is rendered only when
// server-side merchant + image verification succeeded.
const COLOR_SWATCH = {
  black: "#121216", white: "#f5f5f2", grey: "#808084", cream: "#e8dec8",
  beige: "#cdbfa0", tan: "#a67c52", brown: "#5c402c", navy: "#1c2644",
  blue: "#3c5aaa", green: "#346e46", olive: "#585e3a", burgundy: "#5c1a26",
  red: "#be2026", pink: "#e4a0b4", yellow: "#e1be2d", orange: "#dc6923",
  purple: "#704191", silver: "#bec0c8", gold: "#c6a050",
};

/** The verified colour swatches for a piece, or NOTHING.
 *  Renders only for `colorEvidence.status === "verified"` — a colour the
 *  merchant claimed but the images did not corroborate is not shown at all. */
export function ColorEvidenceLine({ item, detailed = false }) {
  const evidence = item?.colorEvidence;
  const colors = evidence?.status === "verified" ? evidence.verifiedColors : [];
  if (!colors?.length) return null;
  return (
    <div className="colorline" title="Cross-checked against the merchant listing and product images">
      {colors.map((color) => <span className="colorswatch" key={color}
        style={{ background: COLOR_SWATCH[color] || "#888" }} aria-hidden="true" />)}
      <b>{colors.join(" + ")}</b>
      {detailed ? <small>merchant confirmed · {evidence.imagesAnalyzed} image{evidence.imagesAnalyzed === 1 ? "" : "s"} checked</small> : null}
    </div>
  );
}

const fitRefreshes = new Map();

// One identity-bound refresh is shared by every mounted product surface. The
// identity check prevents a slow response from a previous account replacing
// the active account's private measurements.
export function refreshFitProfile() {
  const identity = getUid() || "";
  if (fitRefreshes.has(identity)) return fitRefreshes.get(identity);
  const refresh = loadServerFitProfile(identity).then((server) => {
    if ((getUid() || "") !== identity) return null;
    return saveFitProfile(server);
  }).finally(() => fitRefreshes.delete(identity));
  fitRefreshes.set(identity, refresh);
  return refresh;
}

/**
 * The reader's fit profile, kept live across tabs and sign-ins.
 *
 * Seeds from the on-device cache for an instant first paint, then refreshes
 * from the server. Re-reads on `asilum:fit` (edited here) and on
 * `asilum:identity` (signed in or out) — the second matters because a fit
 * profile belongs to a PERSON, and leaving the previous reader's measurements
 * on screen after a sign-out would be showing one person another's body.
 */
export function useFitProfile() {
  const [profile, setProfile] = useState(() => loadFitProfile());
  useEffect(() => {
    let active = true;
    const sync = (event) => {
      if (!active) return;
      setProfile(event?.detail ? { ...event.detail } : loadFitProfile());
    };
    const refresh = () => refreshFitProfile().catch(() => {});
    window.addEventListener("asilum:fit", sync);
    window.addEventListener("asilum:identity", refresh);
    refresh();
    return () => {
      active = false;
      window.removeEventListener("asilum:fit", sync);
      window.removeEventListener("asilum:identity", refresh);
    };
  }, []);
  return profile;
}

/** The fit profile in the shape lib/brain/sizing.js consumes. Use this when
 *  passing it to fit scoring; useFitProfile is for display. */
export function useFitBrain() {
  const profile = useFitProfile();
  return fitProfileForBrain(profile);
}

/**
 * WHAT BACKS THIS PIECE — and unlike ColorEvidenceLine above, this one is
 * LOUD WHEN IT KNOWS LEAST.
 *
 * The colour line renders nothing when there is no evidence, because an
 * unverified colour is simply not a claim worth making. Provenance inverts
 * that: the owner's 27 August ruling is that marketplace inventory is
 * ingested, labelled, and NOT HIDDEN — so the weaker the backing, the more
 * visible the line. Silence is reserved for the one case that needs no
 * caveat, a merchant under agreement.
 *
 * `originEvidence` is stamped server-side by lib/products.js so this component
 * never re-derives the rule and cannot drift from it.
 */
export function OriginLine({ item, detailed = false }) {
  const evidence = item?.originEvidence;
  if (!evidence) return null;
  // A merchant under agreement needs no caveat on a card; the detail view
  // still says who is standing behind it.
  if (evidence.status === "verified" && !detailed) return null;
  const tone = evidence.status === "verified" ? "originline ok" : "originline warn";
  return (
    <div className={tone} title={evidence.note}>
      <b>{evidence.status === "verified" ? "BACKED" : evidence.status === "demo" ? "SAMPLE" : "UNVERIFIED ORIGIN"}</b>
      {detailed ? <span> {evidence.note}</span>
        : evidence.sourceLabel ? <span> · {evidence.sourceLabel}</span> : null}
    </div>
  );
}

/** The one-line fit sentence for a piece, or nothing when there is nothing
 *  honest to say. See fitPhrase in lib/brain/sizing.js for the three states. */
export function ProductFitLine({ item, fit }) {
  const phrase = fitPhrase(item?.size, fit);
  return phrase ? <span className="fitline">{phrase}</span> : null;
}
