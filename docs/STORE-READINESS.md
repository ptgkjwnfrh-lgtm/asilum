# Store readiness — *ASILUM on the App Store

The owner, 30 Oct 2026: *"since the new version has rendering problems lets
just make it app store and google play ready."* Then, 31 Oct 2026: *"ok lets
just do app store apple."* This document is what was built for that, what it
does and does not do, and the exact steps that only the owner can take.
Nothing here was submitted; no Apple account was created or touched.

**Android was dropped at the owner's word on 31 Oct 2026.** The Android
project, `@capacitor/android`, the Play launcher and splash assets, the
`assetlinks.json` document and the Play Console steps that the first cut of
this branch carried are gone; the branch's history has them if Google Play
ever comes back.

## 1. What the app is, plainly

The app is a **native shell around the live site**. [Capacitor](https://capacitorjs.com)
(`@capacitor/core`, `/cli`, `/ios` 8.6.0, pinned) builds an iOS app whose
whole screen is a WKWebView that loads `https://www.asilummagazine.com` —
the same deployment, the same server routes, the same Postgres. Nothing is
bundled but a one-page offline notice.

**A store wrapper does not fix rendering.** The shell is a WKWebView, which
is iPhone Safari's engine: it renders what iPhone Safari renders, with the
same glass at the same tier — `app/components/LiquidGlass.jsx` detects
WebKit the same way (`phoneWebKit`), and WebKit's own filter chain draws the
same bend under the same per-element budget — the same safe-area insets,
the same scrolling. Whatever the new version renders wrongly in Safari on an iPhone
renders the same way inside the app. The "rendering problems" are not
described anywhere in the repo or the notes. Before anyone chases them, the
owner should say **which device, which screen (Feed, a popup, the Masthead,
the deck), and what is wrong** (a strip, a jump, a slow scroll, a glass pane
missing). The most recent rendering work on the trunk is the commit *"iPhone
speed: no per-frame glass bend, no stepped ticker mask, card-size photos"*,
so a Safari-on-iPhone regression from that is the first place to look — in
Safari, not in the shell.

A static export is not an option (the app has server routes and a
database), so the shell must point at a deployed origin. It points at the
canonical one from `lib/site.js`. **Two decisions are the owner's and are
assumed here, not settled:**

| decision | assumed | where to change |
| --- | --- | --- |
| bundle id | `com.asilum.app` | `capacitor.config.json` appId, `lib/store.js` APP_ID, `ios/App/App.xcodeproj` PRODUCT_BUNDLE_IDENTIFIER (both configurations) |
| the origin the shell loads | `https://www.asilummagazine.com` (SITE_ORIGIN's default) | `capacitor.config.json` server.url + allowNavigation, `App.entitlements`, `native/www/index.html` — and the moment the site moves to www.asilum.com, all of them |

Both are pinned by `tests/store-readiness.test.js`, which fails if any copy
drifts from `lib/site.js` or `lib/store.js`. A bundle id cannot be changed
after the first App Store upload, so decide it before step 4.

## 2. What is in the repo

| piece | path | what it does |
| --- | --- | --- |
| Capacitor config | `capacitor.config.json` | `server.url` = the live origin; `allowNavigation` = the site's own hosts only, so every other link (a listing's eBay page, Stripe's receipt, a ticket organizer) opens in **Safari**, by Capacitor's own navigation policy — nothing in the site had to change; `errorPath` = the offline page; the WebView's ground is the dark ground. `npx cap sync ios` copies it into `ios/App/App/` |
| offline page | `native/www/index.html` | shown when the origin cannot load; says so and offers TRY AGAIN. The only "web asset" the app carries |
| iOS project | `ios/App/` | Xcode project, Swift Package Manager (no CocoaPods). `PrivacyInfo.xcprivacy` (the privacy manifest, in the Resources build phase), `App.entitlements` (associated domains for universal links), `Info.plist` (display name `*ASILUM`, portrait on iPhone, no non-exempt encryption), `SceneDelegate.swift` (a universal link opens that page), iPhone-only target (`TARGETED_DEVICE_FAMILY = 1`; set `"1,2"` to add iPad, which then needs iPad screenshots) |
| icon and splash | `scripts/store-assets.mjs` → `ios/App/App/Assets.xcassets/`, `public/icons/` | drawn from the wordmark (`lib/wordmark.js` + the set in `Wordmark.jsx`) with the site's own fonts; committed, so nothing needs the script at build time. Re-run it after a logo change: `node scripts/store-assets.mjs` |
| web manifest | `app/manifest.js` → `/manifest.webmanifest` | name, icons (incl. maskable), standalone display, the ground; linked by Next on every page. "Add to Home Screen" on any phone reads it; the native shell does not |
| theme-color, icons, home-screen title | `app/layout.js` | one `theme-color` per colour scheme from `lib/grounds.js`; the icon links; `appleWebApp` |
| grounds as hex | `lib/grounds.js` | the one place the ground's hex lives outside CSS; the test reads `globals.css` and fails if they differ |
| app identity | `lib/store.js` | `APP_ID`; the builder for the apple-app-site-association document |
| universal links | `app/.well-known/apple-app-site-association/route.js` | 404 until `APPLE_TEAM_ID` is set in the deployment's env (`.env.example`); then a link to the site opens the installed app on the linked page |
| the laws | `tests/store-readiness.test.js` | everything above, pinned |

**Runtime dependency note (constitution §2 / §9).** The three Capacitor
packages are the only new dependencies. The owner's request to be
store-ready is the sign-off for them; nothing else was added. None is
imported by the web app — the bridge is injected by the native layer — so
the browser bundle is unchanged. The CLI is a devDependency; `core` and
`ios` are dependencies because the Xcode project resolves them from
`node_modules` (`ios/App/CapApp-SPM/Package.swift`).

## 3. What was verified on this machine, and what could not be

Verified: `npm run build` and `npm test` green (Node 26 via Homebrew; the
project declares Node ≥ 22); the iOS project generated and `npx cap sync
ios` clean; every page still loads with no env vars and no database; the
manifest, icons, theme-color and the 404 served by the preview; no
horizontal scroll at 375 px.

**Not verified here — this Mac has no Xcode (only the Command Line
Tools):** the Xcode archive was not compiled. The Swift addition is small
and written against Capacitor 8.6.0's public API as read from
`node_modules`, but the first `Product → Archive` on a machine with Xcode
is the real test. Do that before anything in §5.

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
2. **A public privacy policy URL**: use
   `https://www.asilummagazine.com/privacy` (version 1.3 is live; the page
   notes it is under counsel review — finish that review first, since the
   App Store questionnaire must match it). Support URL: the same site, or
   the `legal@` address already on the privacy page.

## 5. Owner steps — building (needs a Mac with Xcode)

0. `npm ci` (Node 22+), then `npx cap sync ios`. Any change to
   `capacitor.config.json` or `native/www/` needs another `npx cap sync ios`.
1. Install the current Xcode (Apple requires apps to be built with its
   latest major SDK each spring; Capacitor 8 needs Xcode 16 or newer).
   `npx cap open ios`. In the `App` target → *Signing & Capabilities*:
   pick the team; automatic signing registers the bundle id and turns on
   Associated Domains from `App.entitlements`. Set `MARKETING_VERSION`
   (the version shown in the store) and `CURRENT_PROJECT_VERSION` (the
   build number; bump it for every upload). Pick *Any iOS Device*,
   *Product → Archive*, then *Distribute App → App Store Connect*.
2. Test it through **TestFlight** on a real iPhone before review — in
   particular: sign-in by email link (the confirmation mail opens the
   site in Safari; with universal links live it opens the app), a Stripe
   checkout, a listing's external link (must open Safari), the offline
   page (airplane mode, relaunch), and — because this is why the shell
   exists — every screen the owner saw render wrongly, side by side with
   Safari on the same phone. They will match (§1).

## 6. Owner steps — the listing

- **Screenshots.** A set for the 6.9" iPhone (1320×2868 or 1290×2796)
  and one for the 6.5" iPhone (1284×2778); the project is iPhone-only, so
  no iPad set is required. Capture them in the app, not the browser: the
  store wants the product as shipped.
- **Text.** Name, subtitle (30 chars), description, keywords, category
  (Shopping, with Lifestyle as the secondary), the age rating
  questionnaire (user-generated content and in-app purchases of physical
  goods are the answers that matter), contact details.
- **Privacy.** App Store Connect's *App Privacy* answers must mirror
  `ios/App/App/PrivacyInfo.xcprivacy` (no tracking; user id, email, name,
  photos and videos, other user content, purchase history, product
  interaction, search history, the optional ethnicity as sensitive info,
  birth date and home town as other data — all linked to identity). Keep
  both in step with `app/privacy/page.js`.
- **Account deletion** (Apple 5.1.1(v)) — **a gap.** An app that creates
  accounts must let the user delete the *account* from inside the app.
  What SETTINGS offers today is DELETE PERSONALIZATION
  (`app/settings/page.js` → `DELETE /api/privacy`), which purges the
  personalization data and reports what it retained; it does not remove
  the Supabase auth user or the account record. Add a real "delete my
  account" that does, reachable from SETTINGS on a phone, before
  submitting, and give App Store Connect its path. Apple rejects for this.
- **Sign in with Apple** (Apple 4.8) is not required: the only sign-in is
  the site's own email sign-in through Supabase, no third-party identity
  provider. If Google or Apple sign-in is ever added, Sign in with Apple
  must come with it.

## 7. Review risks to know about before submitting

**Apple guideline 4.2 (minimum functionality).** Reviewers reject "a
website bundled as an app". ASILUM is not a brochure, but the shell is
honest about being thin, so the listing and the review notes should say
what the app does that a Safari tab does not:

- the device identity (a signed HttpOnly cookie, `u-<uuid>`) that makes the
  Feed personal from the first open, and the Passport that adopts it on
  sign-in — the recommendation brain is the product;
- universal links, so the site's own links land in the app on the right
  page (once §4's env var is set);
- a layout drawn for the phone: the Masthead and the deck sit on the
  safe-area insets, portrait-locked, edge to edge;
- the tactile vocabulary (`lib/haptics.js`) — **honestly: WKWebView never
  vibrates for `navigator.vibrate`**, so on iPhone the haptics are silent
  in this shell, exactly as they are in Safari. Making them real needs the
  `@capacitor/haptics` plugin and a small bridge in `lib/haptics.js`; that
  is the first follow-up worth doing for 4.2, and it is a new dependency,
  so it waits for the owner's word;
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

## 8. The user-agent

The shell appends `ASILUM-App` to the WebView's user-agent. Nothing reads
it yet. It is there so the server can, honestly, tell a store build from a
browser when a store rule makes that necessary (§7) — never to show the app
something the site hides.
