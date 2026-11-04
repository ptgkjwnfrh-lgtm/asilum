"use client";

// app/components/PassportPreview.jsx — the bearer's passport, in preview
// (owner, 9 Sep evening: "in the about me there should be a preview of the
// user's passport"). THE SAME PAGE as /board's document
// (PassportDocument.jsx), read-only, at the rail's width — drawn from the
// SAME real state the document reads (lib/passport/document.js builds the
// strings for both) — and a link to the document itself. Nothing is
// staged: no photo shows the empty frame, no account shows UNISSUED in the
// zone, no taste shows UNCHARTED.

import { useEffect, useState } from "react";
import { authorizedFetch, getUid } from "../../lib/client.js";
import { getProfileInfo } from "../../lib/social.js";
import { vizState } from "../../lib/brain/memory.js";
import { tasteClass } from "../../lib/brain/taste-class.js";
import { convictionsOf, mrzZone, passportLanguage } from "../../lib/passport/document.js";
import PassportDocument from "./PassportDocument.jsx";
import PassportSecurity from "./PassportSecurity.jsx";

export default function PassportPreview() {
  const [uid, setUid] = useState(null);
  const [info, setInfo] = useState({ name: "", handle: "", idnty: "", dob: "", since: "", origin: "—" });
  const [photo, setPhoto] = useState(null);
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    const user = getUid() || "";
    setUid(user || null);
    let since = "", origin = "—";
    try {
      since = window.localStorage.getItem("asilum-member-since") || "";
      setPhoto(window.localStorage.getItem("asilum-pp-photo") || null);
      origin = ((navigator.language || "").split("-")[1] || "").toUpperCase() || "—";
    } catch {}
    setInfo({ ...getProfileInfo(), since, origin });
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setWeights(vizState(d.profile).weights); })
      .catch(() => {});
  }, []);

  const taste = tasteClass(convictionsOf(weights));
  const lang = passportLanguage(uid);
  const mrz = mrzZone({ uid, name: info.name, dob: info.dob, nationality: info.origin, idnty: info.idnty, taste, since: info.since });

  return (
    <a className="ppminilink" href="/board" aria-label="open your passport">
      <div className="ppdoc ppmini" lang="en">
        <PassportSecurity />
        <PassportDocument uid={uid} info={info} taste={taste} lang={lang} mrz={mrz} photo={photo} />
      </div>
      <span className="ppminiopen">OPEN THE PASSPORT →</span>
    </a>
  );
}
