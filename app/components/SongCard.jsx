"use client";

// app/components/SongCard.jsx — THE SONG CARD (owner's feed sketch, 25 Oct
// 2026): the record's art filling a square card, the song's title over it,
// PASS at the corner. HONEST ABOUT ITS SOURCE: there is no music catalog yet
// (lib/music/index.js — Spotify and Apple Music access are applied for, not
// granted), so the Feed generates no SONG card and this component draws one
// only when a real record arrives with a title; it never invents art, a
// title or an artist.

import Icon from "./Icons.jsx";
import { hideCard } from "../../lib/feed/hidden.js";
import { haptic } from "../../lib/haptics.js";

export default function SongCard({ song: s, id }) {
  if (!s || !s.title) return null;
  return (
    <article className="card songcard" data-id={id} data-type="SONG" aria-label={"song: " + s.title + (s.artist ? " by " + s.artist : "")}>
      {s.art ? <img className="songart" src={s.art} alt="" loading="lazy" /> : <span className="songart blank" aria-hidden="true" />}
      <span className="songtitle">{s.title}{s.artist ? <small>{s.artist}</small> : null}</span>
      <button type="button" className="cardpass" onClick={() => { haptic("press"); hideCard(id); }} aria-label={"set aside " + s.title} title="PASS"><Icon name="pass" size={20} /></button>
    </article>
  );
}
