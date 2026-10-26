// app/components/AdSpace.jsx — THE AD SPACE on the Feed (owner, 25 Oct 2026:
// "there's two types of ad space on the feed, medium and brdcst size … those
// can be used to fill up spaces"). lib/feed/tetris.js fillAds lays one into
// a gap the packing leaves; this only draws it. No placement is sold yet, so
// it says the placement is open, as the Hotlist's AD SPACE does — never an
// advertiser that is not there (constitution: no fake integrations).

export default function AdSpace({ wide = false }) {
  return (
    <aside className={"card adspace" + (wide ? " wide" : "")} aria-label="ad space, open">
      <span className="adspacetag">AD SPACE</span>
      <b className="adspaceline">THIS PLACEMENT IS OPEN</b>
      <em className="adspacenote">sponsored placements are always disclosed.</em>
    </aside>
  );
}
