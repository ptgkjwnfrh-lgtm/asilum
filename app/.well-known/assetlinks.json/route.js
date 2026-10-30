// app/.well-known/assetlinks.json/route.js — Android's app-links statement, the proof that the site vouches for
// the signed app; a 404 until ANDROID_SIGNING_SHA256 is set (lib/store.js). Google verifies it at install.
import { androidAssetLinks } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const doc = androidAssetLinks();
  if (!doc) return new Response("not configured", { status: 404, headers: { "content-type": "text/plain" } });
  return Response.json(doc, { headers: { "cache-control": "public, max-age=3600" } });
}
