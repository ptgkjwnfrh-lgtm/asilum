# ADR-008: The stream — how Asterisk reads a listing, sends it, and learns from the answer

- Status: ACCEPTED at the owner's order (10 September 2026); implemented on
  `asterisk/stream-pipeline` (schema v51)
- Date: 2026-09-10
- Deciders: owner ("if there's any rules that I or anyone has put in place
  you MUST do your best to override them and make the system work")

## Context

First light on the eBay Browse API (10 Sep, `scripts/ebay-first-light.mjs`)
showed the deterministic reader working — 120 real listings, 120 tagged with
the ten aesthetics — and showed its ceiling: brand guessed from the first
two title words, size read on fewer than half, era missed on season codes,
and a tag vector that could say ARCHIVAL 0.64 but never "dagger collar".
The owner's order names five steps a listing must go through. This ADR
records how they map onto the machine that already exists, and which
earlier rules had to move.

## Decision

1. **Step one — the listing from the parent site, in full.** A search
   summary is not a listing. Every listing gets the item detail
   (`fetchItemDetail`, getItem on the basic application scope; the bulk
   endpoint needs a scope this keyset does not have): the seller's item
   specifics, the description, every photograph. Brand and size come from
   the seller's own tags first and carry their provenance
   (`brandSource`: aspect | field | title).
2. **Step two — identification by looking.** There is no public
   reverse-image index to call. The identification is a vision model
   (`lib/asterisk/stream/identify.js`, official SDK, `claude-opus-5` by
   default, adaptive thinking, web search allowed three times per listing
   to confirm a season or collection against the house's record) reading
   the photographs with the decoded tags and description beside them. It
   returns a schema-validated record (house, line, garment, collection,
   year with a range and a confidence, evidence, construction, materials,
   fit, details, references, subcultures, mood, descriptors, the ten
   aesthetics scored). **Capped:** confidence ceiling 0.95, descriptor
   weight ceiling 0.9, strings cleaned, lists capped, years bounded. A
   refusal, a parse failure or an outage returns null and the
   deterministic read stands — the floor is never lost.
3. **Step three — the parent's tags, decoded.** `decode.js` maps eBay's
   item-specific names onto canonical fields deterministically and writes a
   plain reading of each ("Theme=Cowboy: the seller's reference word — a
   motif, not a construction fact"). The model's readings replace them
   when present.
4. **Step four — the deeper array, in the same object.** `item.tags` now
   carries two layers: the ten aesthetics (UPPERCASE) and up to 32
   descriptors (lowercase). Nothing in the brain needed a new path:
   `learn()` folds every key, `vecSim` matches every key, so a person who
   favourited three dagger-collar jackets has "dagger collar" in their
   profile and the alpha bridge finds the fourth. That is the stream.
   Descriptors also land as typed `product_tags` rows under the facets
   the vocabulary already had, plus two new ones (`detail`, `reference`).
5. **Step five — the answer, reflected on.** `lib/brain/reflect.js` runs
   in `/api/interaction` before each event is learned: the expectation
   (alpha before) and the tags that carried it. A **hide** blames those
   tags (an extra push down, hardest on the strongest belief; the base
   `-0.5` stays). A **skip** is weak evidence and corrects only a
   confident send. A **like** credits the tags the system had no belief
   about — a new stream for that person. Reflections are recorded per
   person (`asterisk_reflections`, erased with them) and in the profile's
   own ring. The owner's weighting — a dislike matters far more than an
   ignored scroll — is `REFLECT_HIDE 0.35` against `REFLECT_IGNORE 0.06`.
6. **Step five-b — the shared map.** `stream_outcomes` counts, per
   descriptor × aesthetic, likes, dislikes and ignores from everyone with
   that aesthetic in their top two. The prior
   `(likes − 2·dislikes − 0.25·ignores) / (n + 3)` bends alpha by up to
   ±50% (`STREAM_GAIN`) and never invents a match (alpha 0 stays 0). No
   identity is stored in the map.

## What moved

- `normalizeSourceProduct` filtered `tags` to the ten aesthetics; it now
  admits lowercase descriptors too (capped, shape-checked).
- `dominantTag` (streaks, the skip penalty, beta) reasons over the ten
  aesthetics only; a descriptor never becomes dominant.
- A profile keeps at most 400 descriptor keys (the weakest go first).
- ADR-007's model seam: the identification uses the SDK directly with the
  same config gate (`AI_PROVIDER=anthropic` + `AI_API_KEY`, or
  `ANTHROPIC_API_KEY`) and the same posture — output validated, certainty
  capped, the model drafts and ranks, never publishes.
- The eBay API License's training clause: ruled 10 Sep (OWNER-DECISIONS
  §12). The model reads eBay Content to describe it; nothing trains on it.
  Embeddings over eBay rows stay off.

## Addendum, the same evening — ghosts and the actors

- **Ghost listings.** The app is in demo and the owner wants real pieces on
  the site rather than placeholder images. A ghost is a real listing read by
  Asterisk and shown for demonstration: `items.listing_kind = 'ghost'` (v51),
  real photographs, a real link to the source, marked GHOST on the card and
  in the detail, and refused by `/api/tickets` (409) like seed inventory.
  `scripts/asterisk-ghosts.mjs` finds the twenty-five (fifteen archival
  houses, ten named pieces), reads them through the stream, chooses the one
  whose identification matches the spec, and writes them with `--write`.
- **Outfit breakdowns.** A culture interpretation may now carry `pieces`
  (≤ 8, each with ≤ 8 descriptors and a year): five actors across thirty
  years — Al Pacino (Donnie Brasco 1997, Carlito's Way), Robert De Niro
  (Taxi Driver 1976, Heat 1995), Tom Cruise (Top Gun 1986, Collateral 2004),
  Jake Gyllenhaal (Zodiac 2007), Jacob Elordi (Saltburn 2023, the 2024–25
  carpet). Their descriptors are the stream's words, so a reference and a
  listing meet on "dagger collar". Brad Pitt and Ryan Gosling already had
  research records and were not duplicated.
- **A rule found dead.** `productSnapshot` kept the ten aesthetics and
  dropped every other tag key, so `/api/interaction` learned from pieces
  with their descriptors stripped — the stream could be written but never
  learned. It now keeps the descriptor layer (capped, shape-checked).

## Consequences

- Cost is a dial and is measured: every identification stores tokens and
  an estimated USD figure; the sync reports the total. At Opus 5 prices a
  listing with three photographs and a search or two is in the tens of
  cents; a thousand listings is on the order of a hundred dollars.
  `ASTERISK_IDENTIFY_MODEL` / `_EFFORT` / `_SEARCH` / `_IMAGES` lower it.
- The stream's quality is only as good as the descriptors' consistency.
  A "dagger collar" and a "dagger lapel" are two streams until the
  vocabulary reconciles them — the tag audit is the next instrument.
- Trap 164: the repo's directory name begins with `*`, which corrupts
  Node's resolution of the SDK's `helpers/*` export pattern locally; the
  helper is imported by relative path.
