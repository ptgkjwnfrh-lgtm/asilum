"use client";

import { useEffect, useState } from "react";
import { fitPhrase } from "../../lib/brain/sizing.js";
import { fitProfileForBrain, loadFitProfile, loadServerFitProfile, saveFitProfile } from "../../lib/client.js";

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

export function useFitBrain() {
  const [profile, setProfile] = useState(() => loadFitProfile());
  useEffect(() => {
    loadServerFitProfile().then((server) => {
      if (Object.values(server || {}).some((value) => typeof value === "number" && value > 0)) {
        saveFitProfile(server);
        setProfile(server);
      }
    }).catch(() => {});
  }, []);
  return fitProfileForBrain(profile);
}

export function ProductFitLine({ item, fit }) {
  const phrase = fitPhrase(item?.size, fit);
  return phrase ? <span className="fitline">{phrase}</span> : null;
}
