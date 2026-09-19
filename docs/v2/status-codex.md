# Codex status

September 19, 2026. Branch: `codex/v2-ui-integration`, base `67a016f33da6cda20b4e9be00bf90716cdc92e19`.

## Claimed files in this slice

- `app/components/PersonOverview.jsx`
- `app/components/person-overview.css`
- `docs/v2/CLAUDE-BACKEND-HANDOFF.md`
- `docs/v2/CONTRACTS.md`
- `docs/v2/RESOURCES.md`
- `docs/v2/COORDINATION.md`
- `docs/v2/status-codex.md`

The overview slice makes the existing search-only person card compact by default, limits the summary to four lines, expands accessible reading controls, and lets text flow beneath the portrait. The existing Olivier image has a presentation-only head mask for the masthead depth effect. Unknown/new images do not receive an invented mask. Existing sources, follow/save, and correction controls remain available on expansion. Failed device-only correction saves now report failure.

The September 19 owner instruction superseded this preliminary slice. Overview prose now comes only from the revision-pinned Wikipedia pipeline in `docs/WIKIPEDIA-OVERVIEWS.md`; the former hand-written record is disabled. Designer/house separation, career links, exact pair queries, population and attribution are implemented on `codex/v2-catalog-connections`.

Verification on this source: `npm test` passed, 1,410 passed / 76 skipped / 0 failed (1,486 total); `npm run build` passed; `git diff --check` passed. No database credentials were loaded. These gates do not verify live services. Browser visual/interaction QA remains pending because the available browser refused the local preview with `ERR_BLOCKED_BY_CLIENT`; no alternate/public deployment was made to bypass that boundary.

Publication: GitHub issue creation and remote branch creation were each rejected with HTTP 403, `Resource not accessible by integration`. No remote branch, issue, or PR was created by these attempts. The handoff package contains separate documentation and UI patches for an authorized session to publish safely. No engine, database, provider account, payment, or production deployment was changed. Claude acknowledgement remains pending.
