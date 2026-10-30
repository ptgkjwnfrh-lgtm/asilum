# Store readiness — *ASILUM on the App Store and Google Play

The owner, 30 Oct 2026: *"since the new version has rendering problems lets
just make it app store and google play ready."* This document is what was
built for that, what it does and does not do, and the exact steps that only
the owner can take. Nothing here was submitted; no Apple or Google account
was created or touched.

## 1. What the app is, plainly

The app is a **native shell around the live site**. [Capacitor](https://capacitorjs.com)
(`@capacitor/core`, `/cli`, `/ios`, `/android` 8.6.0, pinned) builds an
iOS app and an Android app whose whole screen is a WebView that loads
`https://www.asilummagazine.com` — the same deployment, the same server
routes, the same Postgres. Nothing is bundled but a one-page offline notice.

**A store wrapper does not fix rendering.** The WebView on iPhone *is*
Safari's engine (WKWebView), and on Android it is Chrome's; whatever the
new version renders wrongly on a phone's browser renders the same way inside
the app. The "rendering problems" are not described anywhere in the repo or
the notes. Before anyone chases them, the owner should say **which device,
which screen (Feed, a popup, the Masthead, the deck), and what is wrong**
(a strip, a jump, a slow scroll, a glass pane missing). The most recent
rendering work on the trunk is the commit *"iPhone speed: no per-frame
glass bend, no stepped ticker mask, card-size photos"*, so a Safari-on-iPhone
regression from that is the first place to look — in Safari, not in the
shell.

A static export is not an option (the app has server routes and a
database), so the shell must point at a deployed origin. It points at the
canonical one from `lib/site.js`. **Two decisions are the owner's and are
assumed here, not settled:**

| decision | assumed | where to change |
| --- | --- | --- |
| bundle id / application id | `com.asilum.app` | `capacitor.config.json` appId, `lib/store.js` APP_ID, `ios/App/App.xcodeproj` PRODUCT_BUNDLE_IDENTIFIER, `android/app/build.gradle` applicationId + namespace, `android/app/src/main/java/com/asilum/app/`, `strings.xml` |
| the origin the shell loads | `https://www.asilummagazine.com` (SITE_ORIGIN's default) | `capacitor.config.json` server.url + allowNavigation, `App.entitlements`, `AndroidManifest.xml` data host, `native/www/index.html` — and the moment the site moves to www.asilum.com, all of them |

Both are pinned by `tests/store-readiness.test.js`, which fails if any copy
drifts from `lib/site.js` or `lib/store.js`. A bundle id cannot be changed
after the first App Store upload, so decide it before step 4.

## 2. What is in the repo

| piece | path | what it does |
| --- | --- | --- |
| Capacitor config | `capacitor.config.json` | `server.url` = the live origin; `allowNavigation` = the site's own hosts only, so every other link (a listing's eBay page, Stripe's receipt, a ticket organizer) opens in the **system browser**, both platforms, by Capacitor's own navigation policy — nothing in the site had to change; `errorPath` = the offline page; the WebView's ground is the dark ground |
| offline page | `native/www/index.html` | shown when the origin cannot load; says so and offers TRY AGAIN. The only "web asset" the apps carry |
| iOS project | `ios/App/` | Xcode project, Swift Package Manager (no CocoaPods). `PrivacyInfo.xcprivacy` (the privacy manifest, in the Resources build phase), `App.entitlements` (associated domains for universal links), `Info.plist` (display name `*ASILUM`, portrait on iPhone, no non-exempt encryption), `SceneDelegate.swift` (a universal link opens that page), iPhone-only target (`TARGETED_DEVICE_FAMILY = 1`; set `"1,2"` to add iPad, which then needs iPad screenshots) |
| Android project | `android/` | Gradle project, compile/target SDK 36, min 24. `AndroidManifest.xml` (app-links intent filter with `autoVerify`), `MainActivity.java` (an app link opens that page), splash ground, adaptive icon ground |
| icons and splashes | `scripts/store-assets.mjs` → `ios/App/App/Assets.xcassets/`, `android/app/src/main/res/`, `public/icons/` | drawn from the wordmark (`lib/wordmark.js` + the set in `Wordmark.jsx`) with the site's own fonts; committed, so nothing needs the script at build time. Re-run it after a logo change: `node scripts/store-assets.mjs` |
| web manifest | `app/manifest.js` → `/manifest.webmanifest` | name, icons (incl. maskable), standalone display, the ground; linked by Next on every page |
| theme-color, icons, home-screen title | `app/layout.js` | one `theme-color` per colour scheme from `lib/grounds.js`; the icon links; `appleWebApp` |
| grounds as hex | `lib/grounds.js` | the one place the ground's hex lives outside CSS; the test reads `globals.css` and fails if they differ |
| app identity | `lib/store.js` | `APP_ID`; builders for the two well-known documents |
| universal links / app links | `app/.well-known/apple-app-site-association/route.js`, `app/.well-known/assetlinks.json/route.js` | 404 until `APPLE_TEAM_ID` / `ANDROID_SIGNING_SHA256` are set in the deployment's env (`.env.example`); then a link to the site opens the installed app on the linked page |
| the laws | `tests/store-readiness.test.js` | everything above, pinned |

**Runtime dependency note (constitution §2 / §9).** The four Capacitor
packages are the only new dependencies. The owner's request to be
store-ready is the sign-off for them; nothing else was added. None is
imported by the web app — the bridge is injected by the native layer — so
the browser bundle is unchanged. The CLI is a devDependency; the three
platform packages are dependencies because the native projects resolve
them from `node_modules`.

## 3. What was verified on this machine, and what could not be

Verified: `npm run build` and `npm test` green (Node 26 via Homebrew; the
project declares Node ≥ 22); both platforms generated and `npx cap sync`
clean; every page still loads with no env vars and no database; the
manifest, icons, theme-color and the two 404s served by the preview; no
horizontal scroll at 375 px.

**Not verified here — this Mac has no Xcode (only the Command Line Tools),
no Android Studio, no JDK:** the Xcode archive and the Gradle bundle were
not compiled. The Swift and Java additions are small and written against
Capacitor 8.6.0's public API as read from `node_modules`, but the first
`Product → Archive` and `Build → Generate Signed Bundle` on a machine with
the toolchains is the real test. Do that before anything in §5.

## 4. Owner steps — accounts (nobody else can do these)

1. **Apple Developer Program** — enrol at developer.apple.com/programs
   (US$99/year; an organisation needs a D-U-N-S number, an individual does
   not). Then in App Store Connect: *Apps → + → New App*, platform iOS,
   name `*ASILUM` (if Connect refuses the leading asterisk, use `ASILUM`
   and keep the asterisk in the subtitle and the icon), bundle id
   `com.asilum.app` (registered under *Certificates, Identifiers &
   Profiles → Identifiers* with the **Associated Domains** capability on),
   SKU anything, primary language English (US).
   Copy the **Team ID** (*Membership details*) into Vercel's production env
   as `APPLE_TEAM_ID` and redeploy: `/.well-known/apple-app-site-association`
   then answers, and universal links start working on the next install.
2. **Google Play Console** — register at play.google.com/console (US$25
   once; identity verification; a developer address and, for a new
   personal account, a phone and a **closed test with at least 12 testers
   for 14 days** before production access is granted — plan for it).
   *Create app* → name `*ASILUM`, app, free. Under *Setup → App signing*,
   accept **Play App Signing**; copy the **app signing certificate's
   SHA-256** into Vercel as `ANDROID_SIGNING_SHA256` (the upload key's
   fingerprint may follow after a comma, so local release builds also
   verify) and redeploy: `/.well-known/assetlinks.json` then answers.
3. **Both stores want a public privacy policy URL**: use
   `https://www.asilummagazine.com/privacy` (version 1.3 is live; the page
   notes it is under counsel review — finish that review first, since the
   App Store questionnaire and Play's Data safety form must match it).
   Support URL: the same site, or the `legal@` address already on the
   privacy page.

## 5. Owner steps — building (needs a Mac with the toolchains)

0. `npm ci` (Node 22+), then `npx cap sync`. Any change to
   `capacitor.config.json` or `native/www/` needs another `npx cap sync`.
1. **iOS.** Install the current Xcode (Apple requires apps to be built with
   its latest major SDK each spring; Capacitor 8 needs Xcode 16 or newer).
   `npx cap open ios`. In the `App` target → *Signing & Capabilities*:
   pick the team; automatic signing registers the bundle id and turns on
   Associated Domains from `App.entitlements`. Set `MARKETING_VERSION`
   (the version shown in the store) and `CURRENT_PROJECT_VERSION` (the
   build number; bump it for every upload). Pick *Any iOS Device*,
   *Product → Archive*, then *Distribute App → App Store Connect*.
   Test it through **TestFlight** on a real iPhone before review — in
   particular: sign-in by email link (the confirmation mail opens the
   site in Safari; with universal links live it opens the app), a Stripe
   checkout, a listing's external link (must open Safari), the offline
   page (airplane mode, relaunch).
2. **Android.** Install Android Studio (with its JDK) and the SDK 36
   platform. `npx cap open android`. *Build → Generate Signed App Bundle*:
   create an **upload keystore** on first use and keep it where it cannot
   be lost (Play App Signing holds the real signing key; the upload key
   can be reset through support, slowly). Bump `versionCode` and
   `versionName` in `android/app/build.gradle` for every upload. Upload
   the `.aab` to an **internal testing** track first; test the same four
   flows as on iOS, plus the app link (`adb shell pm get-app-links
   com.asilum.app` should show the domain verified once assetlinks.json
   is live).

## 6. Owner steps — the listings

- **Screenshots.** iOS: a set for the 6.9" iPhone (1320×2868 or 1290×2796)
  and one for the 6.5" iPhone (1284×2778); the project is iPhone-only, so
  no iPad set is required. Android: 2–8 phone screenshots (16:9 to 9:16,
  min 320 px, max 3840 px), a 512×512 icon (`public/icons/icon-512.png`
  is the same artwork) and a 1024×500 feature graphic. Capture them in
  the app, not the browser: the store wants the product as shipped.
- **Text.** Name, subtitle/short description (30/80 chars), description,
  keywords (iOS), category (Shopping, with Lifestyle as the secondary),
  the age rating questionnaire (user-generated content and in-app
  purchases of physical goods are the answers that matter), contact
  details.
- **Privacy.** App Store Connect's *App Privacy* answers must mirror
  `ios/App/App/PrivacyInfo.xcprivacy` (no tracking; user id, email, name,
  photos and videos, other user content, purchase history, product
  interaction, search history, the optional ethnicity as sensitive info,
  birth date and home town as other data — all linked to identity).
  Play's *Data safety* form asks the same questions in its own words.
  Keep both in step with `app/privacy/page.js`.
- **Account deletion** (Apple 5.1.1(v), Play's policy) — **a gap.** An app
  that creates accounts must let the user delete the *account* from inside
  the app. What SETTINGS offers today is DELETE PERSONALIZATION
  (`app/settings/page.js` → `DELETE /api/privacy`), which purges the
  personalization data and reports what it retained; it does not remove
  the Supabase auth user or the account record. Add a real "delete my
  account" that does, reachable from SETTINGS on a phone, before
  submitting, and give the stores its path. Apple rejects for this.
- **Sign in with Apple** (Apple 4.8) is not required: the only sign-in is
  the site's own email sign-in through Supabase, no third-party identity
  provider. If Google or Apple sign-in is ever added, Sign in with Apple
  must come with it.

## 7. Review risks to know about before submitting

**Apple guideline 4.2 (minimum functionality).** Reviewers reject "a
website bundled as an app". ASILUM is not a brochure, but the shell is
honest about being thin, so the listing and the review notes should say
what the app does that a tab does not:

- the device identity (a signed HttpOnly cookie, `u-<uuid>`) that makes the
  Feed personal from the first open, and the Passport that adopts it on
  sign-in — the recommendation brain is the product;
- universal links / app links, so the site's own links land in the app on
  the right page (once §4's env vars are set);
- a layout drawn for the phone: the Masthead and the deck sit on the
  safe-area insets, portrait-locked, edge to edge;
- the tactile vocabulary (`lib/haptics.js`) — **honestly: iOS WKWebView
  never vibrates for `navigator.vibrate`**, so on iPhone the haptics are
  silent in this shell. Android Chrome vibrates. Making them real on iPhone
  needs the `@capacitor/haptics` plugin and a small bridge in
  `lib/haptics.js`; that is the first follow-up worth doing for 4.2, and it
  is a new dependency, so it waits for the owner's word;
- an offline page of its own.

If the reviewer still calls it a wrapper, the answer is features that need
the device: push notifications for messages and BRDCSTs
(`@capacitor/push-notifications` + a server to send them), the camera for
uploads (`@capacitor/camera`), the status-bar plugin to follow the theme.
None was added, each is a dependency and a product decision.

**Apple guideline 3.1.1 (in-app purchase).** Physical goods and real-world
services bought through Stripe are allowed (3.1.3(e): a listing, a ticket).
A fee for a service delivered *inside* the app is where Apple asks for
in-app purchase — the **$30 DROP activation** and the **BRDCST placement
price list** (A6 rulings 1 and 6) are the two to think about. Options: sell
those on the web only (the shell sends the `ASILUM-App` user-agent, so the
server can tell), or accept IAP for them on iOS at Apple's cut. This is a
decision for the owner and, ideally, counsel; it is not made here.

**Google Play.** Target SDK 36 satisfies the 2026 target-level requirement.
Play's *User-generated content* policy wants reporting and blocking; the
moderation ledger and the Watchtower exist — point the policy questionnaire
at them.

## 8. The user-agent

The shell appends `ASILUM-App` to the WebView's user-agent (both
platforms). Nothing reads it yet. It is there so the server can, honestly,
tell a store build from a browser when a store rule makes that necessary
(§7) — never to show the app something the site hides.
