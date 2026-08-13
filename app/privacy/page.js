// app/privacy/page.js — PRIVACY POLICY.
// Constitution §7 launch dependency. Every claim below describes what the
// product ACTUALLY does today (no-faking rule applies to legal pages first).
// Version 1.0 — drafted 2026-07-19; counsel review pending before public
// announcement. Update the version line with every substantive change.

export const metadata = {
  title: "*ASILUM — privacy policy",
  description: "What ASiLUM magazine collects, why, and the controls you hold.",
};

export default function PrivacyPage() {
  return (
    <div className="wrap">
      <div className="locline"><a href="/settings">← SETTINGS</a><span>/ THE FINE PRINT</span></div>
      <h1 className="headline"><span className="red">*</span>PRIVACY POLICY</h1>
      <p className="deck">
        what we collect, why, and the controls you hold. version 1.0 —
        effective july 19, 2026 (under legal review).
      </p>

      <h2 className="statshead">WHO WE ARE</h2>
      <p className="legal">
        ASiLUM magazine (&quot;ASiLUM&quot;, &quot;we&quot;) operates
        asilummagazine.com — a fashion discovery magazine with a personal
        taste engine. Privacy questions and requests:{" "}
        <a href="mailto:legal@asilummagazine.com">legal@asilummagazine.com</a>.
      </p>

      <h2 className="statshead">WHAT WE COLLECT</h2>
      <p className="legal">
        <strong>a pseudonymous device identity.</strong>{" "}a random identifier in
        a signed, http-only cookie plus a matching identifier in your
        browser&apos;s local storage. it is not your name and we do not link it
        to one unless you sign in.
      </p>
      <p className="legal">
        <strong>an optional account.</strong>{" "}signing in uses a magic link, so
        we hold your email address. signing in moves your existing anonymous
        taste data under your account, once, with your action.
      </p>
      <p className="legal">
        <strong>taste signals.</strong>{" "}saves, favorites, skips, searches,
        viewing time, corrections you give Asterisk, and moodboard training
        words. these build the taste profile that ranks your feed. you can
        inspect every class of this data in the{" "}
        <a href="/asterisk">Asterisk control room</a>.
      </p>
      <p className="legal">
        <strong>content you add.</strong>{" "}moodboard images are analyzed for
        color inside your browser — only the color summary and the file name
        reach our servers, never the image itself. wardrobe garment photos are
        different: with your explicit per-upload consent they are stored in a
        private bucket, served only through short-lived signed links, and
        erased — verifiably — when you delete them. body measurements you
        enter stay in the first-party fit engine; they are never sent to
        merchants or to any external model.
      </p>
      <p className="legal">
        <strong>purchase tickets.</strong>{" "}if you ask us to track an external
        purchase, we store what you submitted, with your consent, under the
        disclaimer shown at the time.
      </p>
      <p className="legal">
        <strong>technical records.</strong>{" "}rate-limit counters (stored as
        hashes, not identities), search queries for relevance improvement, and
        the security logs our hosting providers keep to run the site.
      </p>

      <h2 className="statshead">WHAT WE DO NOT DO</h2>
      <p className="legal">
        no advertising. no selling or sharing of personal data for marketing.
        no third-party analytics or tracking pixels. no cross-site tracking.
        no inference of sensitive traits, ever. no children&apos;s data — the
        service is not directed to children under 13 and we do not knowingly
        collect their information. no external AI model receives your personal
        data: every model integration in this product is switched off, and if
        one is ever enabled it will be opt-in, disclosed on the surface where
        it operates, and covered by an updated version of this policy.
      </p>

      <h2 className="statshead">WHO PROCESSES DATA FOR US</h2>
      <p className="legal">
        supabase (database, authentication, and private file storage; hosted
        in canada) and vercel (site hosting, delivery, and security
        filtering). both act under our instructions to run the service — no
        other recipients.
      </p>

      <h2 className="statshead">COOKIES</h2>
      <p className="legal">
        essential cookies only: the signed device-identity cookie described
        above and the short-lived security cookies our hosting sets when it
        checks that a visitor is not an abusive bot. there are no advertising
        or analytics cookies, which is why there is no cookie banner.
      </p>

      <h2 className="statshead">YOUR CONTROLS</h2>
      <p className="legal">
        <strong>see it:</strong>{" "}the <a href="/asterisk">Asterisk control
        room</a> shows what the system holds and lets you export it as JSON.{" "}
        <strong>correct it:</strong>{" "}every recommendation carries correction
        controls that retrain or exclude. <strong>pause it:</strong>{" "}Asterisk
        guidance can be switched off; hard filters still apply and your data
        sits unused. <strong>delete it:</strong>{" "}
        <a href="/settings">Settings</a> holds a typed-confirmation delete
        that removes personalization data, and wardrobe photos erase on
        demand, storage object first. deleting your data is not conditioned
        on anything.
      </p>

      <h2 className="statshead">RETENTION</h2>
      <p className="legal">
        taste and content data persist while your profile is active and go
        when you delete them. security and search records are kept for
        limited operational periods; the exact schedule is under final review
        and this policy will state it when fixed. we never keep deleted
        wardrobe photos — erasure is verified against the storage bucket
        before the request succeeds.
      </p>

      <h2 className="statshead">CHANGES</h2>
      <p className="legal">
        we will post any material change here with a new version number and
        effective date. continued use after the effective date means the new
        version applies.
      </p>
    </div>
  );
}
