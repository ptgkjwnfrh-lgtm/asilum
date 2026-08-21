// app/title-card/page.js — the magazine's title card (owner-directed, 21 Aug).
// The promo-card composition — red rule and block, phosphor caption, the
// wordmark huge, the address line glowing under it, the house band and the
// honest demo-archive note — with the wordmark cut into horizontal bars the
// way the eight-bar IBM mark is, and glitching like the terminal lost signal
// lock for a beat: chromatic ghosts in the house red and phosphor, slice
// displacement in short bursts, a rolling interference band.
//
// A brand artifact, not a destination: noindex + self-canonical but CRAWLABLE
// (the /piece precedent — a social scraper must be able to fetch a card whose
// whole job is being shown around). Not in the sitemap, not in the nav.
// Server component: nothing to fetch, nothing to hydrate; the glitch is CSS
// and shuts off under prefers-reduced-motion.
//
// The wordmark is written in pieces (star element + ASILUM + the address
// line), the og-image's own pattern; the h1's aria-label reads the full name
// as one string, and every visual layer under it is aria-hidden so a screen
// reader hears the name once, unglitched.

export const metadata = {
  title: "TITLE CARD",
  robots: { index: false, follow: false },
  alternates: { canonical: "/title-card" },
};

export default function TitleCardPage() {
  return (
    <div className="tc-plate">
      <div className="tc-frame">
        <div className="tc-rule" aria-hidden="true"><span /></div>
        <p className="tc-cap">PERSONALIZED FASHION TERMINAL</p>

        <h1 className="tc-word" aria-label="*ASILUM magazine — personalized fashion terminal">
          <span className="tc-stack" aria-hidden="true">
            <span className="tc-layer tc-r"><b>*</b>ASILUM</span>
            <span className="tc-layer tc-g"><b>*</b>ASILUM</span>
            <span className="tc-layer tc-face"><b>*</b>ASILUM</span>
          </span>
          <span className="tc-mag" aria-hidden="true">magazine.com</span>
        </h1>

        <div className="tc-band" aria-hidden="true">DISCOVERY - COMMERCE - COMMUNITY</div>
        <p className="tc-note">A DEMO ARCHIVE OF SYNTHETIC SAMPLE RECORDS</p>
        <div className="tc-roll" aria-hidden="true" />
      </div>
    </div>
  );
}
