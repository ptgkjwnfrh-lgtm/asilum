// app/api/edge-subject-probe/route.js — TEMPORARY preview-only probe.
// DO NOT MERGE TO MAIN.
//
// Purpose (owner-approved, Aug 5): decide empirically whether
// TRUSTED_EDGE_IP_HEADER can be enabled. For each candidate platform header
// this echoes what Vercel's edge actually delivered to the runtime and what
// the REAL production derivation (lib/security/request.js trustedEdgeSubject)
// makes of it. The test: request once plain, once with forged IP headers —
// a header is safe only if the forged value cannot move its derived subject.
//
// The env is mutated in-process around calls to the real function (and
// restored) so the probe exercises the exact production code path, not a
// copy. The fallback salt only exists so derivation runs where the preview
// env lacks RATE_LIMIT_SUBJECT_SALT — subjects are compared within one
// deploy, never against production.
//
// Refuses to exist in production; the raw values echoed are only ever the
// requester's own connection metadata.

import { NextResponse } from "next/server";
import { trustedEdgeSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const CANDIDATES = [
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-vercel-proxied-for",
];

export async function GET(req) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const out = {};
  const prevHeader = process.env.TRUSTED_EDGE_IP_HEADER;
  const prevSalt = process.env.RATE_LIMIT_SUBJECT_SALT;
  if (!prevSalt || prevSalt.length < 32) {
    process.env.RATE_LIMIT_SUBJECT_SALT = "probe-salt-0123456789abcdef0123456789abcdef";
  }
  try {
    for (const h of CANDIDATES) {
      process.env.TRUSTED_EDGE_IP_HEADER = h;
      out[h] = { raw: req.headers.get(h), subject: trustedEdgeSubject(req) };
    }
  } finally {
    if (prevHeader === undefined) delete process.env.TRUSTED_EDGE_IP_HEADER;
    else process.env.TRUSTED_EDGE_IP_HEADER = prevHeader;
    if (prevSalt === undefined) delete process.env.RATE_LIMIT_SUBJECT_SALT;
    else process.env.RATE_LIMIT_SUBJECT_SALT = prevSalt;
  }
  return NextResponse.json({ env: process.env.VERCEL_ENV || null, candidates: out });
}
