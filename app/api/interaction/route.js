// app/api/interaction/route.js
// POST /api/interaction
// Body: { user, item: {id, tags}, action, dwellMs }
//   or  { user, events: [{ item, action, dwellMs }, ...] }  (batched dwell)
// action in share|save|favorite|dwell|skip|hide.
// Updates + persists the learned profile, logs the events, feeds the
// co-engagement graph (positive actions link the item to the user's recent
// engagements) and the popularity counters.

import { NextResponse } from "next/server";
import { learn } from "../../../lib/brain/index.js";
import { applyTimeDecay, noteActivity } from "../../../lib/brain/memory.js";
import {
  getProfile, saveProfile, recordInteraction, recordEvent, bumpEdges,
  bumpPopularity, withUserLock,
} from "../../../lib/db/index.js";
import { eventFromInteraction } from "../../../lib/events/index.js";

export const dynamic = "force-dynamic";

const VALID = new Set(["bag", "share", "save", "favorite", "dwell", "skip", "hide"]);
const POSITIVE = new Set(["bag", "share", "save", "favorite"]);
const CO_ENGAGE_SPAN = 5; // link a new positive to this many recent engagements

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.user || "guest";
  const events = Array.isArray(body.events)
    ? body.events
    : [{ item: body.item, action: body.action, dwellMs: body.dwellMs }];

  const valid = events.filter(
    (e) => e && e.item && e.item.id && VALID.has(e.action)
  );
  if (!valid.length) {
    return NextResponse.json(
      { error: "item{id,tags} and valid action required" },
      { status: 400 }
    );
  }

  const edgePairs = [];
  const popBumps = [];

  // Profile read-modify-write is serialized per user so a dwell batch can't
  // race a favorite and drop an update.
  const profile = await withUserLock(userId, async () => {
    let prof = (await getProfile(userId)) || {};
    ({ profile: prof } = applyTimeDecay(prof)); // idle forgetting before learning
    for (const { item, action, dwellMs } of valid) {
      // Graph anchors are the recents BEFORE this event lands.
      const recentBefore = (prof && prof._meta && prof._meta.recent) || [];
      prof = learn(prof, item, action, { dwellMs });
      prof = noteActivity(prof, item, action); // viz ring buffer

      if (POSITIVE.has(action)) {
        const w = action === "bag" ? 2 : action === "share" ? 1.5 : 1;
        for (const rid of recentBefore.slice(0, CO_ENGAGE_SPAN)) {
          edgePairs.push({ a: rid, b: item.id, w });
        }
        popBumps.push({ id: item.id, eng: 1 });
      } else if (action === "dwell" && (dwellMs || 0) >= 4000) {
        popBumps.push({ id: item.id, eng: 0.3 }); // long looks count a little
      }
    }
    await saveProfile(userId, prof);
    return prof;
  });

  await Promise.all([
    bumpEdges(edgePairs),
    bumpPopularity(popBumps),
    ...valid.map((e) =>
      recordInteraction(userId, e.item.id, e.action, e.dwellMs ?? null)
    ),
    // Canonical event history for the Alpha Learning Brain (lib/events).
    ...valid.map((e) => {
      const evt = eventFromInteraction(userId, e.action, e.item, e.dwellMs ?? null);
      return evt ? recordEvent(evt) : Promise.resolve();
    }),
  ]);

  return NextResponse.json({ userId, applied: valid.length, profile });
}
