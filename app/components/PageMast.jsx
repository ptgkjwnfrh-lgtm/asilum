// app/components/PageMast.jsx — THE MASTHEAD, EVERYWHERE (owner, 9 Sep:
// "add more large title words overall to the whole website to match the
// front cover"). A destination's headline set like the cover's masthead —
// the red asterisk, the word, bold and big — and beneath it a faint second
// line in the same cut: the cover's own words for that subsystem (the
// SUBSYSTEMS index on /cover names CATALOG "your curated edit", THE WIRE
// "posts + the hotlist", PASSPORT "train the brain", DISCOVER "the open
// index", SETTINGS "control panel"). Real copy the cover already prints;
// nothing invented here. Pages with no cover line pass none and get the
// masthead alone.

export default function PageMast({ word, sub = "", children }) {
  return (
    <>
      <h1 className="headline"><span className="red">*</span>{word}{children}</h1>
      {sub ? <span className="headsub" aria-hidden="true">{sub}</span> : null}
    </>
  );
}
