import { NextResponse } from "next/server";
import { cronGate } from "../../../../lib/steward/cronGate.js";
import { runCatalogWorker } from "../../../../lib/connections/shopifyCatalog.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req) {
  const gate = cronGate(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  return NextResponse.json(await runCatalogWorker({ limit: 5 }));
}

export async function GET(req) { return run(req); }
export async function POST(req) { return run(req); }
