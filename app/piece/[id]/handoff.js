"use client";

// app/piece/[id]/handoff.js — the hand-off half of the stable piece URL.
//
// `/piece/<id>` exists so a shared link can carry the piece's own preview. Once
// a real reader arrives, the piece belongs in the item modal (asilum-ui rule 8),
// so this sends them to `/?item=<id>` where that modal opens.
//
// `replace`, not `push`: the hand-off must not sit in history, or Back from the
// catalog would bounce the reader straight here and forward again.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PieceHandoff({ target }) {
  const router = useRouter();
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return null;
}
