"use client";

// app/components/TasteGlobe.jsx — VIEW TASTE GLOBE (owner, 3 Nov 2026: the Passport keeps the card, OPEN MAP,
// STAMP PASSPORT and "a small button to VIEW TASTE GLOBE"). The TASTE GLOBE popup (SheetHost VIEWS): the
// network of everything kept (TasteNetwork.jsx), handed the device's stamps and the passenger's moodboards.
// The achievements are the Wardrobe's now, so none ride the globe.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TasteNetwork from "./TasteNetwork.jsx";
import { listSaves } from "../../lib/save.js";
import { authorizedFetch, getUid } from "../../lib/client.js";

export default function TasteGlobe() {
  const router = useRouter();
  const [saves, setSaves] = useState([]);
  const [boards, setBoards] = useState([]);
  useEffect(() => {
    const sync = () => setSaves(listSaves());
    sync();
    window.addEventListener("asilum:save", sync);
    authorizedFetch("/api/boards?user=" + encodeURIComponent(getUid() || "")).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.boards)) setBoards(d.boards); }).catch(() => {});
    return () => window.removeEventListener("asilum:save", sync);
  }, []);
  return (
    <section className="tglobe" aria-label="taste globe">
      <p className="tglobesub">everything you kept, round you — a readable model of your taste, not a scan of you. every node says why it is there; every change can be undone.</p>
      <TasteNetwork saves={saves} boards={boards} stamps={[]} onExplore={(tag) => router.push("/discover?q=" + encodeURIComponent(tag.toLowerCase()))} />
    </section>
  );
}
