// app/components/Wordmark.jsx — THE WORDMARK LOCKUP. It left the shell's
// header when the header left (V.2 Blueprint, owner, 17 Oct 2026: the top
// fixtures are the Info Dock and the Passport Button, nothing else), and it
// lives on as a component the Feed's masthead prints.
//
// MAGAZINE is justified to the exact width of ASILUM above it (owner order,
// 17 Aug) — one letter per span, spread by flex, so the line is flush at
// both ends at EVERY size instead of guessing at a letter-spacing that only
// lands at one font-size. See .wordmark em. aria-label pins the accessible
// name so splitting the word cannot make a screen reader spell it out.
//
// "FASHION TERMINAL" is split per CHARACTER, not per word (owner order,
// 17 Aug). With three words and space-between you get two enormous gaps
// and tightly-set words — which is exactly what looked wrong. Spread every
// glyph instead and the letter gaps come out even, while the space
// character still carries its own width plus a gap either side, so the two
// words stay two words. NBSP because a plain space collapses.

export default function Wordmark({ href = "/" }) {
  return (
    <a className="wordmark" href={href} title="the feed" aria-label="*ASILUM magazine — the feed">
      <i>*</i>ASILUM
      <em aria-hidden="true">
        {"MAGAZINE".split("").map((ch, i) => <span key={i}>{ch}</span>)}
      </em>
      <small aria-hidden="true">
        {"FASHION TERMINAL".split("").map((ch, i) => (
          <span key={i}>{ch === " " ? " " : ch}</span>
        ))}
      </small>
    </a>
  );
}
