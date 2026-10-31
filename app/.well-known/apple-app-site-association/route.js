// app/.well-known/apple-app-site-association/route.js — Apple's universal-links document, served without an
// extension and as JSON, as Apple's CDN fetches it; a 404 until APPLE_TEAM_ID is set (lib/store.js). Public,
// uncached by us (Apple caches it on its own CDN for up to a day).
import { appleAppSiteAssociation } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const doc = appleAppSiteAssociation();
  if (!doc) return new Response("not configured", { status: 404, headers: { "content-type": "text/plain" } });
  return Response.json(doc, { headers: { "cache-control": "public, max-age=3600" } });
}
