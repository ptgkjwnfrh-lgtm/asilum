// lib/store.js — THE NATIVE SHELL'S IDENTITY, in one place (the store shell, 30 Oct 2026; Apple only at the
// owner's word, 31 Oct 2026). The bundle id the App Store knows the app by is capacitor.config.json's appId,
// repeated here for the document that lets a link to the site open the installed app: Apple's
// apple-app-site-association (universal links). It needs a fact only the owner's account holds — the Apple
// Developer Team ID — so it is served ONLY once APPLE_TEAM_ID is set (app/.well-known/apple-app-site-association),
// and is a 404 until then: no document with a blank where the proof should be. docs/STORE-READINESS.md walks the
// owner through it. tests/store-readiness.test.js pins the id to the Xcode project.
import { SITE_HOST } from "./site.js";

export const APP_ID = "com.asilum.app";

/** The Apple Developer Team ID: ten capitals or digits, as App Store Connect prints it. */
const TEAM_ID = /^[A-Z0-9]{10}$/;

/** https://developer.apple.com/documentation/xcode/supporting-associated-domains — null until APPLE_TEAM_ID is set. */
export function appleAppSiteAssociation(env = process.env) {
  const team = String(env.APPLE_TEAM_ID || "").trim().toUpperCase();
  if (!TEAM_ID.test(team)) return null;
  const appID = `${team}.${APP_ID}`;
  return {
    applinks: { details: [{ appIDs: [appID], components: [{ "/": "*", comment: `every page of ${SITE_HOST} opens in the app` }] }] },
    webcredentials: { apps: [appID] },
  };
}
