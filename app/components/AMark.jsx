// app/components/AMark.jsx — |A| (owner ruling 18 Oct 2026, CONSTITUTION
// A6 (4)): "simply a box with the letter A in it". One component draws it
// everywhere the mark appears — the Exploration Active indicator in the Info
// Dock, the Search toggle, |A| Protection, the ASTERISK control. It is never
// the friend asterisk, which is a plain typographic * before a name.
//
// SOLID (owner, 28 Oct 2026: "make the asterisk button a solid red button with
// a negative cut out"): the search fields' ASTERISK toggle is a solid red
// square with the A cut clean through it — a mask, so what is behind the field
// shows in the letter, not a painted letter. Off, it stays solid and dims.
import { useId } from "react";

export default function AMark({ className = "", label = "ASTERISK", size = null, solid = false, ...rest }) {
  const id = useId().replace(/:/g, "");
  if (solid) {
    return (
      <span className={("amark solid " + className).trim()} role="img" aria-label={label} style={size ? { fontSize: size } : undefined} {...rest}>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <mask id={"am" + id} maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="20">
            <rect width="20" height="20" fill="#fff" />
            <text x="10" y="14.4" textAnchor="middle" className="amarkcut">A</text>
          </mask>
          <rect width="20" height="20" rx="3.5" fill="currentColor" mask={"url(#am" + id + ")"} />
        </svg>
      </span>
    );
  }
  return (
    <span className={("amark " + className).trim()} role="img" aria-label={label} style={size ? { fontSize: size } : undefined} {...rest}>A</span>
  );
}
