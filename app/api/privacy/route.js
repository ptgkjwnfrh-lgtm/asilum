// DELETE /api/privacy — erase user-linked personalization data. Purchase
// tickets/consent records, the auth account, and deidentified aggregate item
// statistics are intentionally retained and named in the response.

import { NextResponse } from "next/server";
import { resolveRequestUser, verifiedDevice } from "../../../lib/identity.js";
import {
  purgePersonalizationData, exportPersonalizationData, withUserOperationLock,
} from "../../../lib/db/production.js";
import { deleteUserPhotos } from "../../../lib/wardrobe/photos.js";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";

export const dynamic = "force-dynamic";

// GET /api/privacy — the §6 EXPORT control (the access right). Delete has
// existed since purgePersonalizationData; export did not, so a user could
// erase their data but never see it.
//
// Identity comes from PROOF, never a query parameter, and it serves device
// identities as well as accounts — exactly like DELETE, because an anonymous
// visitor's taste is still theirs. One person can only ever read themselves.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const claimed = searchParams.get("user") || "";
  // resolveRequestUser REQUIRES a non-empty claim — it returns null on "" before
  // it ever looks at the cookie, even when the cookie is valid. Every other
  // route has a client that knows its own id, so nothing hit this. An export is
  // different: it is a person clicking "download my data", and a bare GET has
  // nothing to claim. With no claim, the answer is simply "whoever this device
  // is", which is exactly what the signed cookie proves. A claim, when present,
  // still goes through the normal path so an `sb-` id needs its bearer token.
  const user = claimed ? await resolveRequestUser(req, claimed) : verifiedDevice(req);
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  // Heavier than a normal read (it touches every personal domain), so it is
  // quota'd well below the delete limit but tightly enough that it cannot be
  // used as an amplification lever.
  const quota = await consumeRateLimit({
    scope: "privacy-export", subject: user, limit: 10, windowMs: 60 * 60 * 1000,
  });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))) },
    });
  }
  try {
    const payload = await exportPersonalizationData(user);
    return NextResponse.json(payload, {
      headers: {
        // A download, and never a cached one: this is the whole of a person's
        // personalization data and must not sit in a shared cache.
        "Content-Disposition": `attachment; filename="asilum-personal-data.json"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch {
    return NextResponse.json({ error: "export could not be assembled" }, { status: 502 });
  }
}

export async function DELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 8 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const user = await resolveRequestUser(req, String(body.user || ""));
  if (!user) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (body.confirm !== "DELETE PERSONALIZATION") {
    return NextResponse.json({ error: "confirmation phrase required" }, { status: 400 });
  }
  const quota = await consumeRateLimit({ scope: "privacy-delete", subject: user, limit: 2, windowMs: 60 * 60 * 1000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  // Erase private-storage photos FIRST and loudly — an incomplete erasure is
  // a failed request, not a partial success.
  return withUserOperationLock(user, async (queryTarget) => {
    try {
      await deleteUserPhotos(user);
    } catch {
      return NextResponse.json({
        error: "personalization deletion stopped because photo erasure could not be verified; database rows were not purged",
      }, { status: 502 });
    }
    try {
      const result = await purgePersonalizationData(user, { queryTarget });
      return NextResponse.json({ deleted: true, ...result });
    } catch {
      return NextResponse.json({
        error: "photo objects were erased, but database personalization could not be fully purged",
      }, { status: 502 });
    }
  });
}
