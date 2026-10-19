// app/api/consent/route.js — the consent moment's server half (D4).
// GET reads the state (null = unanswered = unobserved, enforced at every
// observation write path). POST records the answer twice: the HttpOnly
// cookie (what the server reads to enforce) and the profile's
// _meta.consent (the record, and the continuity that rides sb-adoption).
// Recording consent is lawful in every state — it is data ABOUT consent,
// not observation.

import { NextResponse } from "next/server";
import { CONSENT_COOKIE, CONSENT_VERSION, consentState } from "../../../lib/consent.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { consumeRateLimit } from "../../../lib/security/rateLimit.js";
import { mutateProfile } from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  return NextResponse.json(
    { state: consentState(req), version: CONSENT_VERSION },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

export async function POST(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 2 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const choice =
    body.choice === "observe" ? "observe" : body.choice === "general" ? "general" : null;
  if (!choice) {
    return NextResponse.json({ error: "choice must be observe or general" }, { status: 400 });
  }
  const response = NextResponse.json({ state: choice, version: CONSENT_VERSION });
  response.cookies.set(CONSENT_COOKIE, choice, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  try {
    const user = await resolveRequestUser(req, String(body.user || ""));
    if (user) {
      const quota = await consumeRateLimit({
        scope: "consent", subject: user, limit: 30, windowMs: 60 * 60 * 1000,
      });
      if (quota.allowed) {
        await mutateProfile(user, (p) => ({
          ...(p || {}),
          _meta: {
            ...((p && p._meta) || {}),
            consent: { choice, at: new Date().toISOString(), version: CONSENT_VERSION },
          },
        }));
      }
    }
  } catch { /* the cookie alone enforces; the record is best-effort */ }
  return response;
}
