"use client";

// app/components/Wordmark.jsx — THE WORDMARK. It left the shell's header
// when the header left (V.2 Blueprint, owner, 17 Oct 2026) and lived on the
// Feed's masthead; since 19 Oct 2026 it is a FIXTURE of its own (owner: "the
// *ASILUM logo becomes a fixture that permanently sits in the left hand
// corner"), mounted once by the shell (className "brandfix").
//
// THE NAME IS "*ASILUM" (owner, 17 Oct 2026: "when they type it in I just
// want it to look like *ASILUM"; "no more lower case i"). The MAGAZINE and
// FASHION TERMINAL lines of the August lockup are retired with the word:
// the asterisk and the six capitals are the whole mark, everywhere —
// browser tab, social card, order mail, this component.
// tests/brand-name.test.js enforces it.
//
// THE NEW LOGO (owner, 25 Oct 2026, late: "simply import the image I gave
// you"): the owner's own artwork, public/model/logo.jpg — the red asterisk,
// the slate word, the bar of blocks beneath it ending in the lighter blue —
// drawn as given. The name stays in the markup for assistive technology and
// for the brand's own law (tests/brand-name.test.js).
//
// ITS COLOUR (owner, 26 Oct 2026: "make it more blue so it's visible, and
// phosphorus green in dark mode", with the title card, ASILUM title card 15s
// 1080p.mp4, for the dark): the artwork is two masks cut from logo.jpg —
// logo-ink.png, the word and its bar of blocks (each pixel's darkness its
// opacity, so the lighter last block stays lighter), and logo-star.png, the
// asterisk — painted in --wm-ink (a blue in light; the title card's chrome
// washing to mint in dark, glowing) and --warn (red in both, as the card has
// it).

export default function Wordmark({ href = "/", className = "" }) {
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <span className="wmimg" aria-hidden="true"><i className="wmink" /><i className="wmstar" /></span>
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
