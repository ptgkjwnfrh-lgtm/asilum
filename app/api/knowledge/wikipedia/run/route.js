import { NextResponse } from "next/server";
import { cronGate } from "../../../../../lib/steward/cronGate.js";
import { runWikipediaJobs } from "../../../../../lib/people/wikipedia/jobs.js";
import { wikipediaCoverageReport } from "../../../../../lib/db/production.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fire(req) {
  const gate = cronGate(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const run = await runWikipediaJobs({ limit: 5 });
  return NextResponse.json({ ranAt: new Date().toISOString(), ...run, coverage: await wikipediaCoverageReport() });
}

export async function GET(req) { return fire(req); }
export async function POST(req) { return fire(req); }
