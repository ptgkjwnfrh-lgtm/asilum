# Data Inventory, Purposes & Retention Draft

Constitution v2 §6 binds this register; the retention column remains the
retention matrix and stays DRAFT until owner decision 10 (search_logs is
the one class where inaction accrues risk — unbounded today).

Phase 0 register of every personal-data class the system holds today plus
the classes the roadmap adds. Retention values marked DRAFT are engineering
proposals — final periods are owner decision #10 with counsel.

## Held today

| Data class | Store | Purpose | Access | Retention (DRAFT) | User controls today |
|---|---|---|---|---|---|
| Pseudonymous device identity `u-<uuid>` | HMAC cookie + `profiles`/`user_events` | recommendations | server-only resolution | life of profile; deleted via privacy delete | `/api/privacy` delete |
| Account identity `sb-<uuid>` | Supabase Auth + adoption records | login, taste continuity | server-verified bearer | account lifetime | sign-out; deletion flow TBD (gap) |
| Taste profile (tag weights, two-timescale) | `profiles`, `user_style_profiles` | ranking, stylist | server-only | active + decay (6-day half-life); privacy delete | reset brain, privacy delete, corrections |
| Canonical behavior events (20 types) | `user_events` | learning history | server-only | DRAFT: 24 months → aggregate | privacy delete |
| Interactions log | `interactions` | orders view, graph | server-only | DRAFT: 24 months | privacy delete |
| Search queries (+uid when proven) | `search_logs` | search quality | server-only | DRAFT: 90 days raw → aggregate | none yet (gap: retention notice) |
| Corrections | `user_corrections` | personal retraining, moderation | server-only | account lifetime | visible via /api/why history |
| Measurements (body) | v12 measurements store | first-party fit ONLY — never external (invariant) | server-only, never in model payloads | until user clears | `/api/measurements` PUT/clear |
| Wardrobe items + garment photos | `wardrobe_items` + private Supabase Storage | owned-piece styling and color statistics | owner-only server routes; 5-minute signed URLs | until piece or personalization deletion | per-upload consent; erase photo/piece; privacy delete |
| Profile room (handle, theme, statement, anthem picks) | `profile_rooms`/`profile_modules` (account-uuid keyed, ADR-002) | user-authored public profile page | server-only; PUBLIC once published + moderation-visible | account lifetime | publish/unpublish, edit, privacy delete; statement screen → human review |
| Brand cases (opener id, evidence URLs, transition ledger) | `brand_cases`/`brand_case_events` | trust & impersonation adjudication | operator-only (admin token) | operational record — NOT purged by privacy delete (trust/audit basis; counsel to confirm period) | none (operator data; reporter ids appear as opener/actor) |
| Moodboard uploads (filenames, palette swatches — NO image bytes today) | `mood_board_uploads` | taste training | owner-scoped | DRAFT: account lifetime | reset/delete via privacy delete |
| Purchase tickets + user-reported outcomes | `purchase_tickets` | purchase assistance | server-only | DRAFT: 36 months | consent-gated creation |
| Rate-limit subjects | `api_rate_limits` (sha-256 hashed) | abuse control | server-only | window + cleanup sweep | n/a (hashed) |
| AI model audit events | `ai_model_events` | honesty/audit | admin-only | DRAFT: 12 months | n/a |
| Research facts / culture proposals | `learned_facts` | knowledge pipeline | admin-only | permanent (audited lifecycle) | n/a (not personal data; sources public) |

## Added by roadmap (consent & notice requirements)

| New class | Feature | Notice/consent gate before collection |
|---|---|---|
| Unknown-query samples (normalized) | A | retention notice at search; abuse screening; DRAFT 180 days |
| Interpretation feedback | A | in-flow (explicit action); follows device-to-account adoption; removed by privacy delete |
| Learning notifications | A | in-app only; user can disable |
| Memory visibility preferences | B | explicit settings |
| Wear events | C | explicit opt-in |
| Rail preferences | D | implicit UI state (non-sensitive) |
| Profile themes/media | E | moderated public content notice |
| Messages + attachments | F | full policy stack (blocked until owner decisions #2/#3 + counsel) |
| Brand verification evidence | G | business-context notice; private evidence bucket; legal-process disclosure rules |
| Security telemetry (IP-derived) | G | keyed-hash/truncate; DRAFT 90 days; access-restricted |

## Consent matrix (summary)

- **Implicit in product use**: taste events, searches (with published
  retention), rate-limit hashes.
- **Explicit per-feature consent**: measurements (exists), AI stylist/
  moodboard external-model use (`aiConsent`, exists), wardrobe photo
  upload (new), source connections (new), messaging (new).
- **Never collected**: face/biometric data from uploads; sensitive-trait
  inferences (health/religion/sexuality/ethnicity/politics) from taste
  behavior — prohibited by invariant, restated here.

## Gaps flagged for counsel / owner

1. No public Privacy Policy / ToS / AI-transparency notice yet (EU AI
   transparency obligations effective 2026-08-02).
2. Account deletion (auth-level) flow incomplete vs personalization delete.
3. `search_logs` retention is unbounded today — needs the DRAFT cap + a
   cleanup job once the owner sets periods.
4. DMCA designated-agent registration (before any user-media surface goes
   public — Feature C/E).
