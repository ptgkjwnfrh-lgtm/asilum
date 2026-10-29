// app/components/Icons.jsx — the control center's glyphs. One stroke
// weight, one grid, no fills: the restraint of the secondary hardware
// references (a TP-7's ●/▶/■, a HyperSat's engraved arrows) in the
// primary reference's deep-teal ink. Every glyph is decorative — the key
// that holds it carries the readable label, always (the brief: "every
// symbol that is not obvious needs a readable label").
// The fixtures' glyphs (feed, search, post, messages, account; heart, bag,
// bell; the globe) are traced from the owner's fixture sketch of 19 Oct
// 2026: the bento feed, the plain circle of the account, the square speech
// bubble with its tail at the bottom right, the tote, the meridian globe.
// (19 Oct, second pass: "the symbols look like they were all designed
// differently" — feed, search, the account's circle and the globe kept; the
// heart, the bag, the bell, the plus and the bubble redrawn in their
// geometry: arcs and straight runs, corners of 1–1.5, one 17.6 span, and on
// the fixtures one 1.5px stroke whatever the size, globals.css.)

// (25 Oct 2026, late: "too thick and bold and big") one thin stroke
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.15, strokeLinecap: "round", strokeLinejoin: "round" };

const GLYPHS = {
  // (25 Oct 2026, evening: "all the symbols besides the feed button and the
  // passport button to feel like they're made by the same person who made
  // Michroma") — wide, squared, every corner rounded the same, one stroke
  cover: <g {...P}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="6" /><path d="M12 7v10M7 12h10" /></g>,
  feed: <g {...P}><rect x="3" y="2.5" width="9.5" height="8.5" rx="1" /><rect x="14.5" y="2.5" width="6.5" height="7" rx="1" /><rect x="3" y="13" width="4" height="3.5" rx="0.6" /><rect x="8.5" y="13" width="4" height="3.5" rx="0.6" /><rect x="3" y="18" width="9.5" height="3.5" rx="0.8" /><rect x="14.5" y="11.5" width="6.5" height="10" rx="1" /></g>,
  map: <g {...P}><path d="M12 20.8s-6.8-6-6.8-10.6a6.8 6.8 0 0 1 13.6 0c0 4.6-6.8 10.6-6.8 10.6z" /><rect x="9.4" y="7.6" width="5.2" height="5.2" rx="2" /></g>,
  account: <g {...P}><circle cx="12" cy="12" r="8.6" /></g>,
  ledger: <g {...P}><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="2.4" /><path d="M7.6 9h8.8M7.6 12.6h8.8M7.6 16.2h5.2" /></g>,
  heart: <g {...P}><path d="M12 19.4l-6.3-6.1a3.5 3.5 0 0 1 0-5h0a3.5 3.5 0 0 1 5 0L12 9.6l1.3-1.3a3.5 3.5 0 0 1 5 0h0a3.5 3.5 0 0 1 0 5z" /></g>,
  search: <g {...P}><circle cx="10.2" cy="10.2" r="6.8" /><path d="M15.2 15.2l5.6 5.6" /></g>,
  // MESSAGES is an envelope (owner, 25 Oct 2026: "the direct message button should be an envelope")
  messages: <g {...P}><rect x="3.2" y="5.4" width="17.6" height="13.2" rx="1.4" /><path d="M3.8 6.6l8.2 6.2 8.2-6.2" /></g>,
  close: <g {...P}><path d="M5.2 5.2l13.6 13.6M18.8 5.2L5.2 18.8" /></g>,
  back: <g {...P}><path d="M15.2 4.8L8 12l7.2 7.2" /></g>,
  chevron: <g {...P}><path d="M4.8 9.2l7.2 6.6 7.2-6.6" /></g>,
  // the fold (owner's post sketch, 25 Oct 2026, Fig. 7): a triangle under its bar
  fold: <g {...P}><path d="M3.6 5.6h16.8" /><path d="M5.6 9h12.8L12 17.2z" /></g>,
  asterisk: <g {...P}><path d="M12 3.6v16.8M4.8 7.8l14.4 8.4M19.2 7.8L4.8 16.2" /></g>,
  link: <g {...P}><rect x="3.2" y="8.4" width="10" height="7.2" rx="3.6" /><rect x="10.8" y="8.4" width="10" height="7.2" rx="3.6" /></g>,
  glasses: <g {...P}><rect x="3.2" y="9.6" width="7.2" height="6.4" rx="2.6" /><rect x="13.6" y="9.6" width="7.2" height="6.4" rx="2.6" /><path d="M10.4 12.4h3.2M4 9.6l2-4.4h2M20 9.6l-2-4.4h-2" /></g>,
  list: <g {...P}><path d="M3.6 6.6h16.8M3.6 12h16.8M3.6 17.4h11.2" /></g>,
  // THE UPLOAD SYMBOLS (owner, 29 Oct 2026: "make custom upload symbols for the selection"), one a type of post,
  // in the same hand: NOTES a sheet with its corner turned and three lines; STILL a camera, its lens and its
  // finder; MOTION a frame of film, its sprockets and the play mark; BRDCST a mast sending two rings out either
  // side; LISTING a tag with its eyelet; ECHO a story fading out, its rings opening as they go
  "up-notes": <g {...P}><path d="M6.4 3.2h7.8l4.6 4.6v11.6a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19.4V4.6a1.4 1.4 0 0 1 1.4-1.4z" /><path d="M14.2 3.2v4.6h4.6" /><path d="M8.2 11.6h7.6M8.2 14.8h7.6M8.2 18h4.4" /></g>,
  "up-still": <g {...P}><rect x="3.2" y="7" width="17.6" height="12.4" rx="2.4" /><path d="M8.6 7l1.4-2.4h4L15.4 7" /><circle cx="12" cy="13.2" r="3.4" /><path d="M17.2 9.8h.6" /></g>,
  "up-motion": <g {...P}><rect x="3.2" y="5" width="17.6" height="14" rx="2.4" /><path d="M3.2 8.6h2.4M3.2 12h2.4M3.2 15.4h2.4M18.4 8.6h2.4M18.4 12h2.4M18.4 15.4h2.4" /><path d="M10.4 9.4v5.2l4.2-2.6z" /></g>,
  "up-brdcst": <g {...P}><circle cx="12" cy="9.6" r="1.6" /><path d="M12 11.2v9.2M9 20.4h6" /><path d="M8.8 6.4a4.5 4.5 0 0 0 0 6.4M15.2 6.4a4.5 4.5 0 0 1 0 6.4M6 3.6a8.4 8.4 0 0 0 0 12M18 3.6a8.4 8.4 0 0 1 0 12" /></g>,
  "up-listing": <g {...P}><path d="M12.8 3.4h6.4a1.4 1.4 0 0 1 1.4 1.4v6.4l-9.2 9.2a1.4 1.4 0 0 1-2 0l-5.8-5.8a1.4 1.4 0 0 1 0-2z" /><circle cx="16.2" cy="7.8" r="1.4" /></g>,
  "up-echo": <g {...P}><circle cx="12" cy="12" r="3" /><path d="M12 5.8A6.2 6.2 0 1 1 6.63 8.9" /><path d="M12 2.6A9.4 9.4 0 1 1 3.86 16.7" /></g>,
  // DISCOVER (the deck's search bar, 29 Oct 2026): a compass, its needle a diamond
  compass: <g {...P}><circle cx="12" cy="12" r="8.6" /><path d="M14.8 9.2l-1.6 4-4 1.6 1.6-4z" /></g>,
  plus: <g {...P}><path d="M12 4.6v14.8M4.6 12h14.8" /></g>,
  // PASS (owner's feed sketch, 25 Oct 2026): an × standing on a bar — set aside, not deleted
  // STAMP (owner's post sketch, 25 Oct 2026, Fig. 3): a rubber stamp — the handle tapering to its neck, the plate
  stamp: <g {...P}><path d="M8.4 3.4h7.2a1.4 1.4 0 0 1 1.4 1.6l-1.2 7.8H8.2L7 5a1.4 1.4 0 0 1 1.4-1.6z" /><rect x="3.2" y="12.8" width="17.6" height="4.6" rx="1.6" /><path d="M5.6 20.6h12.8" /></g>,
  // three dots, the cards' menu key (28 Oct 2026): three small rings on one line
  dots: <g {...P}><circle cx="5.4" cy="12" r="1.15" /><circle cx="12" cy="12" r="1.15" /><circle cx="18.6" cy="12" r="1.15" /></g>,
  // THE OFFER (owner's messages sketch, 28 Oct 2026): an arrow pointing up and left, in its box
  offer: <g {...P}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.4" /><path d="M16 16L8.4 8.4M8.4 13.6V8.4h5.2" /></g>,
  pass: <g {...P}><path d="M5.6 3.4l12.8 11.2M18.4 3.4L5.6 14.6" /><rect x="3.6" y="18.2" width="16.8" height="2.6" rx="1.3" /></g>,
  minus: <g {...P}><path d="M4.6 12h14.8" /></g>,
  locate: <g {...P}><rect x="8" y="8" width="8" height="8" rx="2.6" /><path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3" /></g>,
  bag: <g {...P}><rect x="3.2" y="8.6" width="17.6" height="12" rx="2.4" /><path d="M8 8.6V7.4a2.2 2.2 0 0 1 2.2-2.2h3.6A2.2 2.2 0 0 1 16 7.4v1.2" /></g>,
  // V.2 fixtures (blueprint, 17 Oct 2026): the globe is the Passport Button,
  // the bell is NOTICES on the Info Dock, post is the center disc, disc is
  // the session dial's own glyph.
  // the equator (owner, 25 Oct 2026: "a horizontal line in it to make it look more like a globe")
  globe: <g {...P}><circle cx="12" cy="12" r="8.8" /><ellipse cx="12" cy="12" rx="4.1" ry="8.8" /><path d="M12 3.2v17.6M3.2 12h17.6" /></g>,
  bell: <g {...P}><path d="M12 3.2v1.4" /><path d="M5.6 16.6v-5.4a6.4 6.4 0 0 1 12.8 0v5.4" /><path d="M3.2 16.6h17.6" /><path d="M9.8 19.6h4.4" /></g>,
  post: <g {...P}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="6.4" /><path d="M12 7.8v8.4M7.8 12h8.4" /></g>,
  disc: <g {...P}><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="8.8" /><rect x="9" y="9" width="6" height="6" rx="3" /><path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3" /></g>,
  // the Feed's post card and place card (owner's references, 18 Oct 2026):
  // the four outline actions — heart, the comment bubble, the stamp (STAMP,
  // the one save) and the share arrow, all on ONE 17.6 span so the row reads
  // even (owner, 25 Oct 2026: "the spacing uniform and the sizing uniform")
  // — the line-drawn venue mark
  // and the star the rating slot wears only when a real source fills it.
  // the bubble's tail is at the RIGHT (owner, 25 Oct 2026: "the comment button should be flipped … so the tail is on the right side")
  comment: <g {...P}><path d="M5.2 5.2h13.6a2 2 0 0 1 2 2v6.4a2 2 0 0 1-2 2h-2.2v4.2l-5-4.2H5.2a2 2 0 0 1-2-2V7.2a2 2 0 0 1 2-2z" /></g>,
  hourglass: <g {...P}><path d="M5.6 3.6h12.8M5.6 20.4h12.8M7.2 3.6v2.6c0 3 4.8 4.4 4.8 5.8s-4.8 2.8-4.8 5.8v2.6M16.8 3.6v2.6c0 3-4.8 4.4-4.8 5.8s4.8 2.8 4.8 5.8v2.6" /></g>,
  share: <g {...P}><path d="M14 4.8l6.8 6.4-6.8 6.4" /><path d="M20.8 11.2H9.6a6.4 6.4 0 0 0-6.4 6.4v1.8" /></g>,
  venue: <g {...P}><path d="M3.6 20.4V11.2l4.2-3 4.2 3v9.2M12 20.4V8l4.2-3 4.2 3v12.4" /><path d="M7.8 8.2V5.6M16.2 5V3.4M3.2 20.4h17.6" /></g>,
  star: <g {...P}><path d="M12 3.6l2.6 5.4 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.2 2.9 1.1-5.8-4.3-4 5.8-.7z" /></g>,
};

export default function Icon({ name, size = 22, className = "" }) {
  const g = GLYPHS[name] || GLYPHS.asterisk;
  return (
    <svg className={"ic" + (className ? " " + className : "")} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {g}
    </svg>
  );
}

export const ICON_NAMES = Object.freeze(Object.keys(GLYPHS));
