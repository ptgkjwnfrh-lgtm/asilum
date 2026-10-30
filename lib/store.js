// lib/store.js — THE NATIVE SHELL'S IDENTITY, in one place (the store shell, 30 Oct 2026: "lets just make it app
// store and google play ready"). The id both stores know the app by — the iOS bundle id and the Android
// application id — is capacitor.config.json's appId, repeated here for the two documents that let a link to the
// site open the installed app: Apple's apple-app-site-association (universal links) and Android's assetlinks.json
// (app links). Each needs a fact only the owner's accounts hold — the Apple Developer Team ID, the Play signing
// certificate's SHA-256 — so each is served ONLY once its env var is set (app/.well-known/*), and is a 404 until
// then: no document with a blank where the proof should be. docs/STORE-READINESS.md walks the owner through it.
// tests/store-readiness.test.js pins the id to the native projects.
import { SITE_HOST } from "./site.js";

export const APP_ID = "com.asilum.app";

/** The Apple Developer Team ID: ten capitals or digits, as App Store Connect prints it. */
const TEAM_ID = /^[A-Z0-9]{10}$/;
/** A certificate's SHA-256 fingerprint as the Play Console prints it: 32 colon-separated hex bytes. */
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

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

/** https://developer.android.com/training/app-links/verify-android-applinks — null until ANDROID_SIGNING_SHA256 is set. */
export function androidAssetLinks(env = process.env) {
  const prints = String(env.ANDROID_SIGNING_SHA256 || "")
    .split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!prints.length || !prints.every((p) => SHA256.test(p))) return null;
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: prints },
  }];
}
