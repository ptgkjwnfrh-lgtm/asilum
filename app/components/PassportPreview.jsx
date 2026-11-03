"use client";

// app/components/PassportPreview.jsx — the bearer's passport, in preview
// (owner, 9 Sep evening: "in the about me there should be a preview of the
// user's passport"). A miniature of the /board document — the clouded
// masthead, the name, the bearer photo, the data page's key fields, the
// machine zone, the map beneath — drawn from the SAME real state the
// document reads (lib/passport/document.js builds the strings for both),
// and a link to the document itself. Nothing is staged: no photo shows the
// empty frame, no account shows UNISSUED in the zone, no taste shows
// UNCHARTED.

import { useEffect, useState } from "react";
import { authorizedFetch, getUid } from "../../lib/client.js";
import { getProfileInfo } from "../../lib/social.js";
import { vizState } from "../../lib/brain/memory.js";
import { tasteClass } from "../../lib/brain/taste-class.js";
import { convictionsOf, mrzZone, nameParts, passportLanguage, passportNumberDisplay, serialLine, sinceDisplay, SERIAL_WIDTH } from "../../lib/passport/document.js";
import ParisMap, { useParisRoads } from "./ParisMap.jsx";
import { MrzLine } from "./Blocks.jsx";

export default function PassportPreview() {
  const map = useParisRoads();
  const [uid, setUid] = useState(null);
  const [info, setInfo] = useState({ name: "", handle: "", idnty: "", dob: "" });
  const [since, setSince] = useState("");
  const [origin, setOrigin] = useState("—");
  const [photo, setPhoto] = useState(null);
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    const user = getUid() || "";
    setUid(user || null);
    setInfo(getProfileInfo());
    try {
      setSince(window.localStorage.getItem("asilum-member-since") || "");
      setPhoto(window.localStorage.getItem("asilum-pp-photo") || null);
      const region = ((navigator.language || "").split("-")[1] || "").toUpperCase();
      setOrigin(region || "—");
    } catch {}
    authorizedFetch("/api/profile?user=" + encodeURIComponent(user))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setWeights(vizState(d.profile).weights); })
      .catch(() => {});
  }, []);

  const taste = tasteClass(convictionsOf(weights));
  const { surname, given } = nameParts(info.name);
  const lang = passportLanguage(uid);
  const mrz = mrzZone({ uid, name: info.name, dob: info.dob, nationality: origin, idnty: info.idnty, taste, since });

  return (
    <a className="ppmini" href="/board" aria-label="open your passport">
      {map && (
        <div className="ppholo" aria-hidden="true">
          <div className="ppholo-a"><ParisMap map={map} /></div>
        </div>
      )}
      <div className="ppmast">
        <MrzLine className="ppserial" text={serialLine(since)} width={SERIAL_WIDTH} />
        <span className="ppnum">№ {passportNumberDisplay(uid)}</span>
        <span className="ppcloud" aria-hidden="true" />
      </div>
      <div className="pptitle">ASILUM TASTE PASSPORT</div>
      <div className="ppminibody">
        <span className="ppphoto ppminiphoto" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : <span className="ppphotoempty">◉</span>}
        </span>
        <dl className="ppid ppminiid">
          <div><dt>SURNAME /<em lang={lang.code} dir={lang.dir}>{lang.surname}</em></dt><dd>{surname.toUpperCase() || "—"}</dd></div>
          <div><dt>GIVEN NAME /<em lang={lang.code} dir={lang.dir}>{lang.given}</em></dt><dd>{given.toUpperCase() || "—"}</dd></div>
          <div><dt>NATIONALITY /<em lang={lang.code} dir={lang.dir}>{lang.nationality}</em></dt><dd>{origin}</dd></div>
          <div><dt>IDNTY /<em lang={lang.code} dir={lang.dir}>{lang.idnty}</em></dt><dd>{info.idnty || "—"}</dd></div>
          <div><dt>TASTE TYPE /<em lang={lang.code} dir={lang.dir}>{lang.taste}</em></dt><dd><span className="ppstar">*</span> {taste}</dd></div>
          <div><dt>DATE OF ISSUE /<em lang={lang.code} dir={lang.dir}>{lang.issue}</em></dt><dd>{sinceDisplay(since)}</dd></div>
          <div className="sp3"><dt>ACCOUNT NO /<em lang={lang.code} dir={lang.dir}>{lang.account}</em></dt><dd className="ppmono">{uid || "—"}</dd></div>
        </dl>
      </div>
      <div className="ppmrz ppminimrz">{mrz.map((line, i) => <MrzLine key={i} text={line} />)}<span className="ppcloud" aria-hidden="true" /></div>
      <span className="ppminiopen">OPEN THE PASSPORT →</span>
    </a>
  );
}
