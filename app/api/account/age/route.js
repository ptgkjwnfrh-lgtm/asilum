// app/api/account/age/route.js
// Records the self-declared birth date behind OWNER DECISION #2 (13+).
//
// The client refuses an under-age date BEFORE creating an account, so this
// route is the second line rather than the first — but it re-checks anyway.
// A client-side gate is a curtain; the number that matters is the one the
// server agreed to store.

import { NextResponse } from "next/server";
import { accountIdFromIdentity, resolveRequestUser } from "../../../../lib/identity.js";
import { readJsonRequest } from "../../../../lib/security/json.js";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/security/rateLimit.js";
import { requestSubject } from "../../../../lib/security/request.js";
import { recordBirthDate, readBirthDate } from "../../../../lib/db/accountAges.js";
import { MINIMUM_AGE, UNDER_AGE_MESSAGE } from "../../../../lib/age.js";

export const dynamic = "force-dynamic";

/**
 * GET — has this account asserted a birth date yet?
 *
 * Answers `{ asserted, minimumAge }` and DELIBERATELY NEVER THE DATE. The
 * shell only needs to know whether to ask; the date itself is personal data
 * and belongs in the §6 export, where a person reads their own.
 *
 * An unidentified caller gets `asserted: false` rather than a 401, because
 * "we have nothing on file for you" is the honest answer to a question about
 * an account that does not exist yet.
 */
export async function GET(req) {
  const claimed = new URL(req.url).searchParams.get("user") || "";
  const user = await resolveRequestUser(req, claimed);
  const accountId = user ? accountIdFromIdentity(user) : null;
  if (!accountId) return NextResponse.json({ asserted: false, minimumAge: MINIMUM_AGE });
  try {
    // Whether an assertion EXISTS, never the date itself. A birth date is
    // personal data and the shell has no use for it — it only needs to know
    // whether to ask. It is in the §6 export, which is where a person reads
    // their own.
    const stored = await readBirthDate(accountId);
    return NextResponse.json({ asserted: Boolean(stored), minimumAge: MINIMUM_AGE });
  } catch {
    return NextResponse.json({ error: "age status unavailable" }, { status: 503 });
  }
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 512 });
  if (parsed.response) return parsed.response;
  const user = await resolveRequestUser(req, String(parsed.body?.user || ""));
  if (!user) return NextResponse.json({ error: "identity required" }, { status: 401 });
  const accountId = accountIdFromIdentity(user);
  if (!accountId) {
    return NextResponse.json({
      error: "an age assertion rides on a signed-in account",
    }, { status: 403 });
  }
  // Tight: a caller trying dates until one passes is guessing at the gate, not
  // correcting a typo.
  const quota = await consumeRateLimit({
    scope: "account-age", subject: requestSubject(req, accountId), limit: 8, windowMs: 60 * 60 * 1000,
  });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });

  try {
    const verdict = await recordBirthDate(accountId, String(parsed.body?.birthDate || ""));
    if (!verdict.ok) {
      // 422, not 400: the request was well-formed and was refused on its
      // merits. The age is NOT echoed back — see lib/age.js.
      return NextResponse.json({
        error: verdict.reason === "under" ? UNDER_AGE_MESSAGE : "that is not a date we can read",
        reason: verdict.reason,
      }, { status: 422 });
    }
    return NextResponse.json({ asserted: true, minimumAge: MINIMUM_AGE });
  } catch {
    return NextResponse.json({ error: "could not record it" }, { status: 503 });
  }
}
