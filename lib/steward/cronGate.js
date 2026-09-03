// lib/steward/cronGate.js — who may fire the steward from outside.
//
// Vercel Cron calls the path in vercel.json with `Authorization: Bearer
// <CRON_SECRET>` when that env var exists on the deployment — and with no
// header at all when it does not. So the gate has two honest answers besides
// yes: 503 when the secret is unset (the schedule is not configured; nothing
// pretends it is) and 401 when the bearer is wrong. Pure so it can be tested
// without next/server; the route is three lines around it.

import { bearerToken, secureTokenEqual } from "../security/request.js";

export function cronGate(req, env = process.env) {
  const secret = String(env.CRON_SECRET || "");
  if (secret.length < 16) return { ok: false, status: 503, error: "steward cron not configured — set CRON_SECRET (16+ chars) and redeploy" };
  if (!secureTokenEqual(bearerToken(req), secret)) return { ok: false, status: 401, error: "bad cron secret" };
  return { ok: true };
}
