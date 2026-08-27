# INVISIBLE MACHINERY

**Owner directive, 27 August 2026.** A design law, not a preference. It ranks
beside the two ASTERISK rules and applies to every complex system in ASILUM.

> *"i want it to feel like magic to a layman how this system can do this
> without me telling it to. this feeling should be followed in every complex
> system so it will be hard for competitors to follow."*

---

## The law

**The system does the complex thing without being asked, and never names the
mechanism.**

Three parts, all required:

1. **No control.** If a capability needs a button labelled with its own
   implementation, it has been designed backwards. Find the moment the person
   is *already* doing something, and act there.
2. **No vocabulary.** The reader never reads "reverse image search",
   "perceptual hash", "embedding", "vector", "model", "algorithm". They read
   what happened, in their own language.
3. **No empty state.** When the system has nothing, it says nothing. A "no
   results" message is a confession that a search took place.

## Why this is a moat, and not just taste

A competitor can copy a button in an afternoon. **The label tells them what to
build.** A feature list is a specification handed to whoever reads it.

What they cannot copy from the outside is a capability with no control
attached, because there is nothing to point at. To reproduce it they would
have to work out:

- **when** it fires — which moment in which flow
- **when it stays silent** — which is most of the time, and is the hard part
- **how sure it has to be** before it speaks at all

That judgement is the product. The hash function is a commodity; **knowing
that a wrong recognition is worse than no recognition** is not.

There is a second-order effect worth naming: a system with no visible controls
looks *simpler* than the one it beats. Competitors benchmarking feature lists
will conclude ASILUM does less.

## The reference implementation

**Stamp recognition.** A person stamps their passport with a photograph
because that is what a passport is for. If the archive already holds that
exact photograph, the passport shows it.

| | |
| --- | --- |
| Control | none, and never will be |
| Trigger | the upload the person was already doing |
| Cost | one canvas pass — the pixels were already decoded for the palette |
| Sent | a 16-character hash. **Never the photograph** |
| Says | *"the archive holds this one."* |
| Never says | match, search, scan, hash, confidence, "no results" |
| When unsure | **nothing appears at all** |

Files: `lib/vision/stampReading.js`, `lib/images/dhash.js`,
`app/api/moodboard/route.js` (`recognizeStamps`), `app/board/page.js`.

### The privacy property is not decoration

The photograph never leaves the device. It is reduced to 72 grey pixels and
collapsed to a hash that cannot be turned back into a picture. Uploading the
image to be matched server-side would be slower, more expensive, and would
take a person's photograph for a feature that never needed it.

The honest framing: **doing it the invisible way was also the only way that
respected the person.** That is usually true, and it is worth looking for.

## Applying it — the four questions

Before building any complex capability:

1. **What is the person already doing when this becomes useful?** That is the
   trigger. If the answer is "clicking the button for it", start again.
2. **What is the smallest true sentence?** Not what the system did — what is
   now true. *"the archive holds this one"*, never *"1 match found (distance 4)"*.
3. **What is the silence threshold?** Below it, the feature does not exist for
   this person right now. Set it tight: a recognition that is sometimes wrong
   is not magic, it is a bug with good lighting.
4. **Does the invisible version send less data?** It usually does. If so, that
   is the argument that makes it non-negotiable.

## How it binds to ASTERISK's first law

They are the same discipline from two directions.

- **The first law** says: never assert what you cannot back.
- **This law** says: when you *can* back it, say it plainly and without
  ceremony — and when you cannot, say nothing rather than hedging.

A confidence bar, a percentage, a "possible match" is the failure of both at
once: it names the mechanism *and* it publishes a guess. **The correct output
of low confidence is silence**, not a caveat.

## Where it applies next

| System | The invisible version |
| --- | --- |
| Marketplace pipeline | Pieces surface because they suit the reader — never a "sourcing feed" |
| Price/comparables | *"below the twelve like it we hold"* — never a "market value" widget |
| JP↔EN resolution | Japanese listings are simply readable. No language control |
| Authenticity evidence | Only where the stake is real (`stakeOf`). No "verify" button |
| Archivalist training | A queue with buttons. The reader never sees it happened |

## What this is NOT permission to do

- **Not permission to hide a decision that affects someone.** Provenance,
  pricing, consent and moderation are stated *more* loudly, not less. This law
  governs MECHANISM, never CONSEQUENCE.
- **Not permission to act without consent.** Stamp recognition runs inside an
  upload the person chose, under the existing explicit-action consent gate.
- **Not permission to be quiet about being wrong.** Silence is for
  uncertainty, never for error.
