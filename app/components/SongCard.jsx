"use client";

// app/components/SongCard.jsx — THE SONG CARD (owner's feed sketch, 25 Oct
// 2026): the record's art filling a square card, the song's title over it.
// HONEST ABOUT ITS SOURCE: there is no music catalog yet (lib/music/index.js
// — Spotify and Apple Music access are applied for, not granted), so the
// Feed generates no SONG card and this component draws one only when a
// record arrives with a title; it never invents art, a title or an artist.
// The MODEL's records (lib/model/songs.js) are real titles labelled SAMPLE —
// no art, no link, no playback — and the card says SAMPLE (owner, 28 Oct 2026: "label the sample song cards
// SAMPLE"; it had printed the title and artist alone). PASS lives in the card menu, behind the three dots
// (HoldMenu.jsx).

import { useCallback, useState } from "react";
import { HoldMenu, CardDots } from "./HoldMenu.jsx";
import ModelTag from "./ModelTag.jsx";

export default function SongCard({ song: s, id }) {
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  if (!s || !s.title) return null;
  const what = "the song " + s.title;
  return (
    <article className="card songcard" data-id={id} data-type="SONG" aria-label={(s.sample ? "sample song: " : "song: ") + s.title + (s.artist ? " by " + s.artist : "")}>
      <CardDots what={what} open={menu} onOpen={() => setMenu(true)} />
      <HoldMenu id={id} what={what} open={menu} onClose={close} />
      {s.art ? <img className="songart" src={s.art} alt="" loading="lazy" /> : <span className="songart blank" aria-hidden="true" />}
      {s.sample ? <ModelTag kind="sample" /> : null}
      <span className="songtitle">{s.title}{s.artist ? <small>{s.artist}</small> : null}</span>
    </article>
  );
}
