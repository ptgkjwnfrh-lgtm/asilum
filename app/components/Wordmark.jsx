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
// drawn as given, blended onto the page (its white ground multiplies away
// in light; in dark the picture is inverted and screened). The name stays
// in the markup for assistive technology and for the brand's own law
// (tests/brand-name.test.js).

export default function Wordmark({ href = "/", className = "" }) {
  return (
    <a className={"wordmark" + (className ? " " + className : "")} href={href} title="the feed" aria-label="*ASILUM — the feed">
      <img className="wmimg" src="/model/logo.jpg" alt="" />
      <span className="wmword idlabel"><i>*</i><span className="wmcaps">ASILUM</span></span>
    </a>
  );
}
