# V.2 slice 16 — Apple Maps (31 October 2026)

The owner's word (31 Oct 2026): "i still need song APIs, Apple maps APIs,
and the ticketmaster API." The songs and the tickets landed in slice 15
behind their switches; this slice is the map.

## What landed

| Need | Where | Status |
| --- | --- | --- |
| Apple's map on the place surfaces | `lib/places/mapkit.js` (an ES256 MapKit JS token minted from the owner's Apple Developer key, thirty minutes, the key never leaves the server; no dependency — Node's crypto signs it), `/api/mapkit/token` (`enabled: false` with the reason when unkeyed; 503 only for a key that is set but malformed), `app/components/PlaceMap.jsx` (asks the route once per page; keyed, loads Apple's script and draws the map with the same pins; unkeyed, draws `FashionMap` exactly as before), `MapSheet.jsx` and `PlacesPanel.jsx` draw through it, the policy in `next.config.mjs` admits `cdn.apple-mapkit.com` | shipped behind `MAPKIT_TEAM_ID` + `MAPKIT_KEY_ID` + `MAPKIT_PRIVATE_KEY` — **not exercised against Apple (no Developer Program key on this machine)**; the token is proven against the ES256 spec with a generated P-256 key, the surfaces against their source |

## Decisions recorded (the owner may overrule)

1. **The schematic stays the default and the public Passport's draw.** A
   keyless deploy never contacts Apple, and the hidden-city ring never
   draws streets, Apple's or anyone's.
2. **Apple before the roads map.** In the places panel a keyed deploy draws
   Apple's map even for a reader whose own area document would have drawn
   `StreetMap`; the owner asked for Apple's map, and the roads hologram
   remains the Passport's.
3. **Tokens, not keys.** The page only ever holds a thirty-minute token;
   `MAPKIT_ORIGIN` binds it to one origin when set.

## What the owner does

Join the Apple Developer Program (developer.apple.com, $99 a year; the same
membership unlocks MusicKit and an App Store listing). Then Certificates,
Identifiers & Profiles → Keys → a key with **MapKit JS** enabled; download
the `.p8` once. Set `MAPKIT_TEAM_ID` (the ten-character team id),
`MAPKIT_KEY_ID` (the key's id) and `MAPKIT_PRIVATE_KEY` (the `.p8` file's
text, newlines as `\n` if pasted on one line) locally and in Vercel. The
first keyed run is the first live run; `tests/apple-maps.test.js` is what
is proven without one.

## Honest gaps

- Not run against Apple yet. The MapKit JS surface (annotations, regions,
  colour schemes) is coded to the documented 5.x API.
- Apple's free allowance is 250 000 map views a day; nothing here meters it.
