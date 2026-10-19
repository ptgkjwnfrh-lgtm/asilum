# AUTHENTICITY EVIDENCE — the spec, and how to finish it

**Status: the frame is built and shipped inert-but-real.** One signal runs
today. Four are declared and unbuilt. Finishing one is writing one function —
**nothing else in the system changes.**

Read this before touching `lib/authenticity/`.

---

## 1. Why there is no rep checker, and never will be

The ask was to clone an AI replica checker. It cannot be cloned, and it should
not be built:

- **Entrupy's product is a microscope.** The hardware *is* the method.
- **CheckCheck and LegitGrails are human expert networks**, with proprietary
  models on top.
- **None publish weights, datasets or methods.**

And the deciding reason is the owner's own first law, not caution:

> A model that prints "authentic — 94%" from a phone photograph is **guessing,
> about a purchase**, where being wrong costs a reader real money and costs
> ASILUM real liability.

So **ASILUM authenticates nothing.** It reports what it could see and leaves
the conclusion with the person spending the money. The words *authentic*,
*genuine*, *fake*, *replica* and *legit* never appear on this surface, and
`tests/authenticity-evidence.test.js` fails if they start.

## 2. The two laws it is built under

| Law | What it forces here |
| --- | --- |
| **ASTERISK does not guess** | Every observation traces to something checkable. No scores, no percentages, no probability |
| **Invisible machinery** | No "check this" button. Evidence rides the request that already fires when a piece opens |

### The one place silence is wrong

Invisible machinery says *no empty state*. Coverage looks like one and is not:

- **Below the stake threshold** → total silence. The feature does not exist for
  that reader. Not a collapsed panel, not a grey tick — nothing.
- **Above it** → the reader is about to pay for a claim. Telling them *"1 of 5
  checks could run"* is not ceremony, **it is the finding.** Withholding it
  hides a consequence, which `INVISIBLE-MACHINERY.md` explicitly forbids: the
  law governs *mechanism*, never *consequence*.

The threshold is `stakeOf` in `lib/provenance.js` — the owner's ruling that
verification matters in proportion to how much of the price rests on an
unchecked name.

## 3. How it works today

```
piece opens → /api/related (already fetching "more like this")
            → readEvidence(item)
            → below stake?  null, key omitted entirely
            → above stake?  { observations, checked, total, notChecked }
            → modal renders .sawline
```

No new round-trip. No control. Nothing in the interface that offers a check.

## 4. The signal register

`SIGNALS` in `lib/authenticity/evidence.js`. A signal with `read: null` is
**declared but unbuilt** — reported as "not checked" with its `needs` sentence.
Honest today, and the implementation checklist later.

| Signal | State | What it needs |
| --- | --- | --- |
| `image-reuse` | ✅ **BUILT** | — |
| `price-position` | ⬜ declared | Comparables, ROADMAP §4.6. **Silent below n=3** |
| `house-tells` | ⬜ declared | The archivalist reference library. Human work |
| `seller-history` | ⬜ declared | A licensed marketplace feed. Blocked on Buyee/ZenMarket, not on code |
| `detail-coverage` | ⬜ declared | Which close-ups the listing carries. Cheapest to build next |

### Why `image-reuse` was the one to build first

It is the only signal that is **real evidence today**: a pixel computation over
images we already hold. Catalog images are fingerprinted at ingest
(`saveImageFingerprint`), and `findImageCollisions` was written for exactly
this — stolen-image screening, the anti-impersonation directive.

Reused photography is the oldest signal there is. A seller who did not
photograph the thing they are selling may have a perfectly good reason — and
**the reader is the one who gets to decide what it is.** We state the fact:

> *"this photograph is also on 3 other listings."*

Not *"likely replica"*. Not a score. A fact, checkable by anyone.

## 5. Adding a signal next month — the whole procedure

1. Find its entry in `SIGNALS` and replace `read: null` with a function.
2. It receives `(item)` and returns `{ said }` when it has something **true** to
   state, or `null` for silence.
3. It must never return a number, a score, or a verdict. The tests enforce this.
4. That is all. Coverage counts, the surface, the stake gate and the styling
   already work.

```js
{
  id: "detail-coverage",
  needs: "the close-up photographs a check would need",
  async read(item) {
    const shots = await requiredShotsFor(item);       // your work
    if (!shots.missing.length) return null;           // nothing to say
    return { said: `the listing has no ${shots.missing.join(", ")}.` };
  },
}
```

### The test that will stop you

`tests/authenticity-evidence.test.js` asserts:

- no verdict vocabulary anywhere on the surface
- no `score` / `percent` / `probability` in the module's **code**
- silence below the stake threshold
- coverage stated above it
- unbuilt signals are `null`, never stubs that return something
- **a thrown signal counts as *not checked*, never as *nothing found*** —
  absence of evidence is not evidence of absence

## 6. What must NOT be added

- ❌ A verdict, score, percentage, badge, shield, or traffic light
- ❌ A "Check Authenticity" control of any kind
- ❌ A model that reads a photograph and opines
- ❌ Any signal that cannot point at its evidence
- ❌ Ranking effects — provenance and evidence **never move a score**
  (`tests/provenance.test.js` enforces this)

## 7. Before any of this is user-visible

**Legal review.** Reporting evidence is a much safer posture than
authenticating, and the wording was chosen for that — but a surface that
influences purchase decisions about branded goods should be read by counsel
before launch. Add it to `OWNER-DECISIONS.md` when the second signal lands.
