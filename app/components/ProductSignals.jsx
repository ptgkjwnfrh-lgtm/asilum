"use client";

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

export function useFitBrain() {
  const profile = useFitProfile();
  return fitProfileForBrain(profile);
}

export function ProductFitLine({ item, fit }) {
  const phrase = fitPhrase(item?.size, fit);
  return phrase ? <span className="fitline">{phrase}</span> : null;
}
