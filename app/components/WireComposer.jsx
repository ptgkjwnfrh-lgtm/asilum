"use client";

// app/components/WireComposer.jsx — the composer at the head of THE STREAM
// (V.2 round three, owner: "merge the wire and the feed together so users
// have a constant stream of media"). CREATE / CURATE / INTERPRET and a
// category ride as hashtags on the transmission text — the refs the wire
// already parses — so no schema moves. Posting is named (a signed-in
// account); reading is open. The device copy is written only AFTER the
// server accepts (a refusal must look like a refusal).

import { useEffect, useState } from "react";
import GlassPane from "./GlassPane.jsx";
import { Avatar } from "./UserBits.jsx";
import { getUid, postJSON } from "../../lib/client.js";
import { getProfileInfo, addPost } from "../../lib/social.js";
import { WIRE_CATEGORIES, WIRE_INTENTS } from "../../lib/model/media.js";

export default function WireComposer({ onPublished, compact = false }) {
  const [intent, setIntent] = useState("create");
  const [category, setCategory] = useState("style");
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(!compact);
  const [anon, setAnon] = useState(false);
  useEffect(() => {
    const check = () => setAnon(!(getUid() || "").startsWith("sb-"));
    check();
    window.addEventListener("asilum:identity", check);
    return () => window.removeEventListener("asilum:identity", check);
  }, []);

  function publish() {
    const t = text.trim();
    if (!t) return;
    const cap = caption.trim();
    const info = getProfileInfo();
    const refs = `#${intent} #${category}`;
    const body = t.includes(refs) ? t : `${t}\n\n${refs}`;
    postJSON("/api/editorial", { user: getUid(), handle: info.handle || info.name, text: body, title: cap || undefined })
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        if (!res.ok) { setNote((d && (d.error || d.note)) || "the wire did not accept that transmission"); return; }
        addPost(body, info, cap);
        setNote(d && d.held ? (d.note || "your transmission is saved and paused for a human review") : "");
        setText(""); setCaption("");
        if (onPublished) onPublished();
      })
      .catch(() => setNote("the shared wire could not be reached — nothing was published"));
  }

  return (
    <GlassPane glass="lg-stream-compose" className={"wcomposer streamcompose" + (open ? "" : " closed")} aria-label="post to the stream">
      {!open ? (
        <button className="streamopen" onClick={() => setOpen(true)}>
          <Avatar name={getProfileInfo().name} />
          <span>make something · select with credit · add context</span>
          <b>POST</b>
        </button>
      ) : (
        <>
          <div className="wintents seg" role="group" aria-label="what kind of post">
            {WIRE_INTENTS.map((i) => (
              <button key={i.id} className={"fmode" + (intent === i.id ? " cur" : "")} title={i.means} aria-pressed={intent === i.id} onClick={() => setIntent(i.id)}>{i.label}</button>
            ))}
            <span className="wintentmeans">{(WIRE_INTENTS.find((i) => i.id === intent) || {}).means}</span>
          </div>
          <div className="wcats" role="group" aria-label="category">
            {WIRE_CATEGORIES.map((c) => (
              <button key={c.id} className={"wchip" + (category === c.id ? " on" : "")} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</button>
            ))}
          </div>
          {anon && (
            <p className="pempty">transmissions ride on a signed-in account — reading is open, posting is named. <a className="bizapply" href="/profile#access">sign in on your passport →</a></p>
          )}
          <div className="wcompose">
            <Avatar name={getProfileInfo().name} />
            <div className="wcright">
              <input aria-label="caption" className="wcap" type="text" maxLength={200} placeholder="caption — becomes the transmission's header" value={caption} onChange={(e) => setCaption(e.target.value)} />
              <textarea aria-label="the transmission" rows={3} maxLength={5000} placeholder="the transmission — today's uniform, tonight's find, the film, the plate, the whole account of it…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="cvcomposerow">
                <span className="ccount">{text.length}/5000 · images and video arrive with the media pipeline</span>
                {compact && <button className="txtbtn" onClick={() => setOpen(false)}>CLOSE</button>}
                <button className="btn postbtn" onClick={publish} disabled={!text.trim()}>POST</button>
              </div>
            </div>
          </div>
          {note && <div className="pempty">{note}</div>}
        </>
      )}
    </GlassPane>
  );
}
