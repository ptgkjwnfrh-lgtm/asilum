// tests/store-readiness.test.js — THE STORE SHELL'S LAWS (docs/STORE-READINESS.md, 30 Oct 2026). The native
// projects in ios/ and android/ are generated files a reviewer never reads end to end, so the facts that make
// them the same app as the site are pinned here: one id, one origin and no other, the grounds taken from the
// tokens and not retyped, the privacy manifest actually in the build, the icons the manifest and the layout name
// present and the right shape, and the two well-known documents silent until the owner's own facts arrive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SITE_HOST, REDIRECT_HOSTS } from "../lib/site.js";
import { GROUND, WARN } from "../lib/grounds.js";
import { APP_ID, appleAppSiteAssociation, androidAssetLinks } from "../lib/store.js";
import manifest from "../app/manifest.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + p, "utf8");
const cap = JSON.parse(read("capacitor.config.json"));
const PBX = "ios/App/App.xcodeproj/project.pbxproj";
const HEX = /^#[0-9a-f]{6}$/;

test("the shell loads the live site and may navigate only on the site's own hosts", () => {
  assert.equal(cap.appId, APP_ID, "capacitor.config.json appId is lib/store.js APP_ID");
  assert.equal(cap.appName, "*ASILUM");
  assert.equal(new URL(cap.server.url).host, SITE_HOST, "server.url is the canonical origin (lib/site.js)");
  assert.equal(new URL(cap.server.url).protocol, "https:");
  assert.notEqual(cap.server.cleartext, true, "no cleartext traffic");
  const own = new Set([SITE_HOST, ...REDIRECT_HOSTS]);
  assert.ok(Array.isArray(cap.server.allowNavigation) && cap.server.allowNavigation.length > 0);
  for (const host of cap.server.allowNavigation) {
    assert.ok(own.has(host), `${host} is one of the site's own hosts, not a wildcard or a third party`);
  }
  assert.ok(existsSync(ROOT + cap.webDir + "/" + cap.server.errorPath), "the offline page named by errorPath exists in webDir");
  assert.equal(cap.backgroundColor, GROUND.dark, "the WebView's ground is the dark ground");
});

test("the grounds are the tokens: lib/grounds.js equals app/globals.css, nothing retyped", () => {
  const css = read("app/globals.css");
  const token = (block, name) => {
    const at = css.indexOf(block);
    assert.ok(at >= 0, `${block} is in globals.css`);
    const m = css.slice(at).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `${name} after ${block}`);
    return m[1].toLowerCase();
  };
  assert.equal(GROUND.dark, token(":root {", "--bg"));
  assert.equal(GROUND.light, token('[data-theme="light"] {', "--bg"));
  assert.equal(WARN, token(":root { --warn", "--warn"));
  for (const v of [GROUND.dark, GROUND.light, WARN]) assert.match(v, HEX);
  // the Android copies cannot import it; they are checked against it
  assert.match(read("android/app/src/main/res/values/ic_launcher_background.xml"), new RegExp(`<color name="ic_launcher_background">${GROUND.dark}</color>`, "i"));
  assert.match(read("android/app/src/main/res/values/styles.xml"), new RegExp(`windowSplashScreenBackground">${GROUND.dark}<`, "i"));
});

test("the layout and the manifest name icons that exist and are the size they claim, in the ground's colour", async () => {
  const layout = read("app/layout.js");
  assert.match(layout, /themeColor:\s*\[/, "the viewport declares theme-color");
  assert.match(layout, /color: GROUND\.light/);
  assert.match(layout, /color: GROUND\.dark/);
  assert.match(layout, /applicationName: "\*ASILUM"/);
  assert.match(layout, /appleWebApp: \{ capable: true, title: "\*ASILUM"/);
  const m = manifest();
  assert.equal(m.name, "*ASILUM");
  assert.equal(m.short_name, "*ASILUM");
  assert.equal(m.theme_color, GROUND.dark);
  assert.equal(m.background_color, GROUND.dark);
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.purpose === "maskable"), "a maskable icon for Android's launcher");
  const named = [...m.icons.map((i) => [i.src, i.sizes]), ...[...layout.matchAll(/url: "(\/icons\/[^"]+)", sizes: "([^"]+)"/g)].map((x) => [x[1], x[2]])];
  assert.ok(named.length >= 6);
  for (const [src, sizes] of named) {
    const file = ROOT + "public" + src;
    assert.ok(existsSync(file), `${src} exists`);
    const [w, h] = sizes.split("x").map(Number);
    const meta = await sharp(file).metadata();
    assert.deepEqual([meta.width, meta.height], [w, h], `${src} is ${sizes}`);
    assert.equal(meta.hasAlpha, false, `${src} is opaque (it sits on the ground)`);
  }
});

test("iOS: the privacy manifest and the entitlements are in the build, the name is the brand, the icon is opaque", async () => {
  const pbx = read(PBX);
  const resources = pbx.slice(pbx.indexOf("/* Begin PBXResourcesBuildPhase section */"), pbx.indexOf("/* End PBXResourcesBuildPhase section */"));
  assert.match(resources, /PrivacyInfo\.xcprivacy in Resources/, "PrivacyInfo.xcprivacy is copied into the bundle, not just on disk");
  assert.match(pbx, /path = PrivacyInfo\.xcprivacy;/);
  assert.equal((pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2, "both configurations sign with the entitlements");
  assert.equal((pbx.match(new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID.replace(/\./g, "\\.")};`, "g")) || []).length, 2);
  for (const f of ["ios/App/App/PrivacyInfo.xcprivacy", "ios/App/App/App.entitlements", "ios/App/App/Info.plist"]) assert.ok(existsSync(ROOT + f), f);
  const privacy = read("ios/App/App/PrivacyInfo.xcprivacy");
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/, "no tracking");
  assert.match(privacy, /NSPrivacyCollectedDataTypeUserID/, "the device cookie and the account id are declared");
  assert.match(privacy, /NSPrivacyCollectedDataTypeSensitiveInfo/, "the Passport's optional ethnicity is declared (A6 (7))");
  assert.doesNotMatch(privacy, /NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/, "nothing is collected for tracking");
  assert.match(read("ios/App/App/App.entitlements"), new RegExp(`<string>applinks:${SITE_HOST}</string>`));
  const plist = read("ios/App/App/Info.plist");
  assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>\*ASILUM<\/string>/);
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  const icon = await sharp(ROOT + "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png").metadata();
  assert.deepEqual([icon.width, icon.height, icon.hasAlpha], [1024, 1024, false], "App Store Connect refuses an icon with an alpha channel");
  assert.match(read("ios/App/App/SceneDelegate.swift"), /shouldAllowNavigation\(to: host\)/, "a universal link opens only on the site's hosts");
});

test("Android: one id, the brand's name, app links on the site's host, the adaptive icon at every density", () => {
  const gradle = read("android/app/build.gradle");
  assert.match(gradle, new RegExp(`applicationId "${APP_ID.replace(/\./g, "\\.")}"`));
  assert.match(gradle, new RegExp(`namespace = "${APP_ID.replace(/\./g, "\\.")}"`));
  assert.match(read("android/app/src/main/res/values/strings.xml"), /<string name="app_name">\*ASILUM<\/string>/);
  const manifestXml = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifestXml, /<intent-filter android:autoVerify="true">/);
  assert.match(manifestXml, new RegExp(`<data android:scheme="https" android:host="${SITE_HOST}" />`));
  assert.doesNotMatch(manifestXml, /usesCleartextTraffic="true"/);
  const activity = `android/app/src/main/java/${APP_ID.replace(/\./g, "/")}/MainActivity.java`;
  assert.ok(existsSync(ROOT + activity), activity);
  assert.match(read(activity), /equalsIgnoreCase\(url\.getHost\(\)\)/, "an app link opens only on the site's host");
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    for (const f of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      assert.ok(existsSync(ROOT + `android/app/src/main/res/mipmap-${d}/${f}`), `mipmap-${d}/${f}`);
    }
  }
  assert.match(read("android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"), /@color\/ic_launcher_background/);
});

test("the well-known documents are silent until the owner's facts arrive, then name this app and no other", () => {
  assert.equal(appleAppSiteAssociation({}), null);
  assert.equal(appleAppSiteAssociation({ APPLE_TEAM_ID: "abc" }), null, "a malformed team id publishes nothing");
  const aasa = appleAppSiteAssociation({ APPLE_TEAM_ID: "abcde12345" });
  assert.deepEqual(aasa.applinks.details[0].appIDs, [`ABCDE12345.${APP_ID}`]);
  assert.deepEqual(aasa.webcredentials.apps, [`ABCDE12345.${APP_ID}`]);
  assert.equal(androidAssetLinks({}), null);
  assert.equal(androidAssetLinks({ ANDROID_SIGNING_SHA256: "deadbeef" }), null, "a malformed fingerprint publishes nothing");
  const print = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, "0")).join(":");
  const links = androidAssetLinks({ ANDROID_SIGNING_SHA256: print });
  assert.equal(links[0].target.package_name, APP_ID);
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [print.toUpperCase()]);
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
  for (const r of ["app/.well-known/apple-app-site-association/route.js", "app/.well-known/assetlinks.json/route.js"]) {
    assert.match(read(r), /export const dynamic = "force-dynamic"/, `${r} reads the env at request time`);
    assert.match(read(r), /status: 404/, `${r} is a 404 until configured`);
  }
  assert.match(read(".env.example"), /^APPLE_TEAM_ID=$/m);
  assert.match(read(".env.example"), /^ANDROID_SIGNING_SHA256=$/m);
});

test("the offline page is the shell's own: plain, honest, and a way back to the live site", () => {
  const page = read(cap.webDir + "/" + cap.server.errorPath);
  assert.match(page, /needs a connection/);
  assert.match(page, new RegExp(`href="${cap.server.url.replace(/\./g, "\\.")}/"`), "TRY AGAIN goes to the live origin");
  assert.doesNotMatch(page, /<script/, "nothing runs on the offline page");
});
