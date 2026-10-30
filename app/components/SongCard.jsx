"use client";

// app/components/SongCard.jsx — THE SONG CARD (owner's feed sketch, 25 Oct
// 2026): the record's art filling a square card, the song's title over it.
// HONEST ABOUT ITS SOURCE. Two kinds of record reach this card:
//   • the MODEL's SAMPLE (lib/model/songs.js): a real title labelled SAMPLE —
//     no art, no link, no playback — and the card says SAMPLE (owner, 28 Oct
//     2026: "label the sample song cards SAMPLE");
//   • the catalog's own record (lib/music/itunes.js, 30 Oct 2026): the
//     sleeve, the store link the terms ask for, and a 30-SECOND PREVIEW that
//     plays through the one player (lib/music/player.js) as a `song` source,
//     so the Music Circle holds it while the passenger browses.
// Never invents art, a title or an artist. PASS lives in the card menu,
// behind the three dots (HoldMenu.jsx).

import { useCallback, useState } from "react";
import { HoldMenu, CardDots } from "./HoldMenu.jsx";
import ModelTag from "./ModelTag.jsx";
import { takeAudio, usePlayer, toggleAudio } from "../../lib/music/player.js";
import { haptic } from "../../lib/haptics.js";

export default function SongCard({ song: s, id }) {
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const player = usePlayer();
  const [refused, setRefused] = useState(false);
  if (!s || !s.title) return null;
  const what = "the song " + s.title;
  const preview = !s.sample && s.previewUrl ? s.previewUrl : null;
  const held = !!(preview && player.source && player.source.src === preview);
  const playing = held && player.state === "playing";
  async function play() {
    if (!preview) return;
    haptic("press");
    if (held) { toggleAudio(); return; }
    const ok = await takeAudio({ kind: "song", src: preview, at: 0, title: s.title, by: s.artist || "", url: s.url || null, color: null });
    setRefused(!ok);
  }
  const state = refused ? "the browser refused to play it" : playing ? "playing · 0:30 preview" : held ? "paused · 0:30 preview" : "▶ 0:30 preview";
  return (
    <article className={"card songcard" + (held ? " held" : "")} data-id={id} data-type="SONG" aria-label={(s.sample ? "sample song: " : "song: ") + s.title + (s.artist ? " by " + s.artist : "")}>
      <CardDots what={what} open={menu} onOpen={() => setMenu(true)} />
      <HoldMenu id={id} what={what} open={menu} onClose={close} />
      {s.art ? <img className="songart" src={s.art} alt="" loading="lazy" /> : <span className="songart blank" aria-hidden="true" />}
      {preview
        ? <button type="button" className="songplay" onClick={play} aria-pressed={playing} aria-label={(playing ? "pause the preview of " : "play a 30-second preview of ") + s.title}><span className="idlabel">{playing ? "PAUSE" : "PLAY"}</span></button>
        : null}
      {s.sample ? <ModelTag kind="sample" /> : null}
      <span className="songtitle">
        {s.title}
        {s.artist ? <small>{s.artist}</small> : null}
        {preview ? <small className="songstate" aria-live="polite">{state}</small> : null}
        {!s.sample && s.url ? <a className="songlink" href={s.url} target="_blank" rel="noopener noreferrer">APPLE MUSIC ↗</a> : null}
      </span>
    </article>
  );
}
