# WAITING — alerts and the digest, without an alert

**Status: the engine is built and tested. Three delivery channels are declared
and unbuilt.** Adding one is writing one function.

---

## 1. What this replaces

The competitor's version is a **Discord you join** and a **webhook that pings
you**. That is a notification product: the person configures an alert, names a
brand, sets a ceiling, and maintains it forever. Plus 50 finds every Sunday
whether or not anything happened.

**ASILUM already knows what you are waiting for.**

You searched for something and got nothing back. We logged it — the query, the
date, the zero. When inventory arrives that answers it, the terminal says so.

No alert to configure. No brand list to maintain. No channel to join.

## 2. Why an empty search is the only honest signal

ASTERISK may only reason from what it can point at. Every alternative is a
guess:

| Signal | Why it is not a want |
| --- | --- |
| Taste profile | Says what you *tend to like*, not that you wanted a specific thing and could not have it |
| Board saves | Things you **found**. A want is a thing you did not |
| Dwell time | Attention, which is not desire |
| Follows | Interest in a house, not a need for a piece |

**An empty search is different in kind.** The person typed the words, we
answered "nothing", and both halves are in the log. Telling them when we can
finally answer is not marketing — it is closing a loop they opened.

It is also first-party throughout: one person's searches, read to serve that
same person, already visible in their §6 export, never aggregated across
readers. The privacy-respecting version is again the only one with evidence
behind it.

## 3. "Answered" has exactly one defensible definition

**The search that returned nothing would now return something.**

Not "we found a lookalike". Not "something scored above a threshold". The want
was recorded *precisely when that search served zero*, so the only honest test
is whether it still would — which means asking the real engine again.

> ### The first draft got this wrong, twice, and the numbers said so
>
> **It ranked the pool by hand** and kept anything above a floor. That returned
> **170 "answers" for "black wool coat"** — every one a `category browse`
> fallback, top result a varsity jacket. The real engine serves **zero** for
> that query. A hand-rolled matcher drifts from search, and then a person is
> told their want was answered by a piece the search page refuses to show them.
>
> **Then it read the wrong response key** — `served.items` where the engine
> returns `served.results` — so every want came back unanswered. Nothing threw.
> Nothing logged. The feature was silent, **which is also exactly what it does
> when working correctly.**
>
> That second one is why `tests/waiting.test.js` opens with a POSITIVE test. A
> feature whose failure mode is silence needs one, or broken and quiet are the
> same shape.

### What the sentence may say

The search now returns results. That is what is true, and it is what may be
said. **Not** "the piece you wanted arrived" — the engine broadens, and a want
for `rick owens ring boot size 47` can be answered by an approach shoe. The
honest line is about the *search*:

> *you looked for this in July. it finds something now.*

## 4. Replaying is not searching

`searchProducts` gained a `log` option, defaulting true. **Waiting passes
`log: false`.**

Without it the feature poisons its own evidence: replaying a person's old
queries would write search rows nobody typed, inflate demand counts, and
corrupt the exact log that wants are read from. Any caller that is not a
person at a keyboard must pass it.

## 5. Delivery — the channel registry

The engine is the product; a channel is where it comes out. They are separated
so adding one is registering an adapter, not rebuilding what "waiting" means.

| Channel | State | Needs |
| --- | --- | --- |
| `on-platform` | ✅ **BUILT** | — rides `/api/feed`, the request that already fires |
| `weekly-digest` | ⬜ declared | `SENDGRID_API_KEY` + a verified sender (`lib/notify.js`) |
| `discord` | ⬜ declared | A per-reader webhook URL they supply, and a rate ceiling |
| `push` | ⬜ declared | A web-push subscription and a VAPID key pair |

### On Discord specifically

The owner asked for it and it belongs here — **as one channel among others,
never as the destination.** The objection recorded in the roadmap was to
Discord being the place a person must go to receive the product. As an output
alongside email and on-platform it is ordinary.

Note when building it: a webhook URL is a **secret that grants posting rights
to someone's server.** Store per reader, never share, never log.

### On the weekly digest specifically

The competitor sends 50 finds every Sunday regardless. **This sends what
arrived, and if nothing arrived it does not send.**

A weekly mail saying "nothing this week" is the empty state that gives the
whole trick away — and it trains a person to ignore the thing, which is the one
failure a digest cannot recover from.

## 6. Adding a channel — the procedure

1. Find its entry in `CHANNELS` and set `built: true`, adding a `send`.
2. It receives `(userId, arrived)` where `arrived` is `[{ want, items }]`.
3. **Never send an empty one.** `whatArrived` already omits wants with no
   answers; a channel must additionally not fire when the whole list is empty.
4. Respect consent — delivery off-platform is not covered by the on-platform
   observation gate and needs its own opt-in.
5. Rate-ceiling it. The engine is happy to find six answered wants at once;
   a person is not happy to receive six messages.

## 7. What must NOT be built

- ❌ **An alert-configuration surface** — no watchlist, no price ceiling, no
  "notify me". The record of asking already exists
- ❌ **A digest that sends when nothing happened**
- ❌ **A matcher that is not the search engine.** It drifts, and the drift is
  invisible until a reader clicks through to nothing
- ❌ **Logging replays.** It corrupts the signal the feature depends on
- ❌ **Wants inferred from taste.** That is a guess, and this system has a
  record instead
