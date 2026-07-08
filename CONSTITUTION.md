# *ASILUM Constitution

Binding rules for all work on this app (issued July 7, 2026). Every change and every PR must comply.

## Mission
Stabilize the existing ASILUM magazine prototype into a real MVP — a curated fashion magazine and product-discovery platform (browse products, discover independent designers, read editorial, save to a mood board, later connect real sources: eBay, Shopify designer stores, Pinterest, affiliate feeds). Do not build the full empire at once. Foundation first.

## UI protection (highest priority)
- DO NOT redesign the site or change the visual identity: layout, spacing, typography, colors, navigation, buttons, page structure, animations, aesthetic.
- Do not change the homepage / discover / mood board / hotlist-editorial / profile / settings designs.
- Do not simplify visuals, do not genericize into a SaaS layout, do not remove the magazine/fashion feel.
- Only touch UI code when required to connect functionality, fix broken state, or prevent errors.

## Working rules
1. Inspect before changing. 2. Identify what breaks or is fake. 3. Preserve the UI. 4. Remove unstable behavior without removing the visual experience. 5. Real persistence via Supabase (or clean prep for it). 6. `npm run build` must pass — fix the build before adding anything. 7. Smallest possible, reversible changes. 8. No duplicate routes/components/unnecessary files. 9. No rewrites. 10. Never edit main directly — branch, then PR.

After each meaningful fix, report: file changed / why / what it fixes / what to test next.

## MVP scope
Build: homepage, discover, product detail, designer profiles, editorial/hotlist, Mood Board Lite (saved products), user login, saved items, real DB persistence, then eBay Browse API → Pinterest OAuth → Shopify Storefront.

Do NOT build yet: full checkout, seller payouts, tax/refund/shipping handling, social feed, follower system, fake purchase history, fake connected accounts, fake Grailed/Depop/SSENSE/Farfetch plugins, full AI stylist, complex algorithm dashboard.

## Data & honesty rules
- No pretend partnerships (SSENSE, Grailed, Depop, Farfetch, …). No fake OAuth. No simulated purchase history presented as imported.
- Demo data must be clearly separated from real data; demo products must not look like real partner inventory.
- Unconnected features gracefully say "coming soon / requires setup" — keep the UI shell.

## Backend
Supabase preferred (auth + Postgres + storage). Tables: users/profiles, products, designers, saved_items, mood_boards, mood_board_items, articles, product_sources, interactions (see `supabase/schema.sql`). All credentials via env vars (see `.env.example`); never hardcode; never expose secret keys to the browser.

## Integrations (in order, only when the foundation is stable)
- eBay: clean adapter, env-driven; v1 = search + display resale products (title, image, price, condition, source, external link).
- Pinterest: real OAuth only; v1 = import mood board inspiration with permission.
- Shopify: don't assume designers have it; manual designer/product uploads come first.

## Stability bar
Every page loads without runtime errors. No crash on: missing API keys, empty database, missing images, incomplete metadata. Production build never breaks.

## Reporting & review
Every final report includes: (1) summary of changes, (2) files changed, (3) build pass status, (4) remaining issues, (5) what to test manually, (6) what Codex should review.

PRs (never auto-merged) explain: what was fixed, what was not changed, how the UI was preserved, how to test, risks/known issues. Codex reviews for: broken imports, build failures, duplicated components, unsafe secrets, fake integrations posing as real, database issues, unstable state, unnecessary UI changes, dead routes, missing error handling.
