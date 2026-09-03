"use client";

// app/components/KindGate.jsx — the client half of the account-kind split.
//
// WHAT THIS IS AND IS NOT. This decides what a person SEES. It is not what
// keeps data safe: every route that will serve real numbers checks the kind
// again on the server, against the signed cookie, before it reads anything.
// A client gate alone is a curtain, not a lock, and saying otherwise is how a
// curtain ends up load-bearing.
//
// Today /analytics and /watchtower hold no data, so the curtain is the whole
// requirement. The moment they do, the server check ships with the data — not
// after it.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_KIND, can, homeFor } from "../../lib/accounts.js";
import { authorizedFetch, getUid } from "../../lib/client.js";

export default function KindGate({ capability, children }) {
  const router = useRouter();
  const [kind, setKind] = useState(null); // null = still asking

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // authorizedFetch, NOT fetch. A bare fetch cannot prove the sb-
        // identity, so the route fell back to the DEFAULT kind and every
        // business account was told it was a passport — then bounced off its
        // own analytics by the redirect below. The database hiccup the next
        // comment worries about was, in fact, permanent and universal.
        const response = await authorizedFetch(
          "/api/account/kind?user=" + encodeURIComponent(getUid() || ""),
          { cache: "no-store" });
        if (!response.ok) {
          // Unreadable. Do NOT assume the default and bounce — that would
          // throw a business off its own analytics during a database hiccup.
          if (!cancelled) setKind(DEFAULT_KIND === "passport" ? "unknown" : "unknown");
          return;
        }
        const data = await response.json();
        if (!cancelled) setKind(data?.kind || DEFAULT_KIND);
      } catch {
        if (!cancelled) setKind("unknown");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (kind && kind !== "unknown" && !can(kind, capability)) {
      router.replace(homeFor(kind));
    }
  }, [kind, capability, router]);

  if (kind === null) return <div className="kindwait">reading your account…</div>;
  if (kind === "unknown") {
    return (
      <div className="kindwait">
        could not read what kind of account this is. nothing is shown rather
        than the wrong thing — reload, or check back shortly.
      </div>
    );
  }
  if (!can(kind, capability)) return <div className="kindwait">taking you back…</div>;
  return children;
}
