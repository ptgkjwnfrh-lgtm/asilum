# V.2 parallel-work coordination

Owner target: Sunday, September 20, 2026. Planning timezone: America/New_York. This is a delivery target, not a verified completion claim.

Repository: `ptgkjwnfrh-lgtm/asilum`.

- Integration base: `ui/live-launch-v2`, audited at `67a016f33da6cda20b4e9be00bf90716cdc92e19`.
- Codex UI branch: `codex/v2-ui-integration` (local; remote publication blocked).
- Claude backend branch: proposed `claude/v2-engines`, created by Claude after checking active work.
- Planned shared communication: a GitHub issue titled **V.2 Sunday integration: Codex UI + Claude engines**. Issue creation was blocked by the GitHub connection on September 19 with HTTP 403, `Resource not accessible by integration`. No issue number or remote PR exists yet. Publish the prepared issue once authorized write access is available, then link PRs and contract decisions there.
- This handoff is in the local Codex branch and the downloadable handoff package. Remote branch creation was also blocked with the same GitHub 403. Claude can read the package now and publish it using their own existing authorized repo access; do not assume the remote Codex branch exists until verified. Branch backend work from the integration base, avoiding unrelated UI commits in backend PRs.

Codex currently has read access through its GitHub connection; write attempts were rejected. It cannot launch, inspect, or keep a separate Claude session running. The owner opens Claude with the starter below. Once repo write access is available, both active sessions can communicate through the issue and PRs. No acknowledgement from Claude has been received at the time this file was created.

## Starter for Claude

> Work in ptgkjwnfrh-lgtm/asilum. Read the attached ASILUM-V2-Claude-Handoff package, starting with README.md and docs/v2/CLAUDE-BACKEND-HANDOFF.md, CONTRACTS.md, RESOURCES.md, and COORDINATION.md. Codex's GitHub writes were rejected, so first verify whether its prepared branch and coordination issue have since been published. If your session already has authorized write access, publish the handoff and issue using README.md; otherwise report the access blocker. You own ASTERISK, search, sizing, messaging, purchase/order backend, sourcing, APIs and persistence. Codex owns UI. Check active work, acknowledge your branch and exact claimed files, then start backend work from ui/live-launch-v2. Ship a small compatible slice early with tests and endpoint fixtures. Target September 20. Do not overwrite UI work, change contracts silently, merge main, deploy, or enable paid services without the applicable authorization.

## Working protocol

1. At session start and before editing shared files, read the latest issue comments, open PRs, and branch heads. State claimed paths and the next concrete deliverable.
2. Each agent uses a separate branch/worktree. Do not share a checkout, force-push, or write into the other agent's dirty worktree. Codex owns `status-codex.md`; Claude may add `status-claude.md`. The issue is the integration conversation.
3. Post contract questions as `CONTRACT REQUEST`, with current/proposed shape, reason, compatibility, affected files, and a fixture. The receiver answers `ACK` or an exact amendment. Until acknowledged, preserve existing behavior or use an additive versioned adapter.
4. At each coherent milestone, post `READY FOR INTEGRATION`: commit/PR, routes/files, verification, remaining limitations, and next dependency. Do not mark tasks complete because code was merely generated.
5. Review incoming notes at milestone boundaries and before ending an active session. Repo comments do not automatically wake a stopped session. Do not claim continuous background collaboration.
6. Pull/rebase the integration base before final checks. Resolve cross-lane conflicts together, keep the other agent's changes intact, and run required gates. Small PRs target `ui/live-launch-v2`; production/main merge remains owner-controlled under AGENTS.md.

## Checkpoints

| Checkpoint | Required evidence |
|---|---|
| Saturday start | Both branches acknowledged; contracts reviewed; actual provider/schema access and source coverage inventoried. |
| Saturday first slice | Codex compact overview interaction; Claude entity/search intersection plus measurements fixes and sample responses. |
| Sunday morning | Integrated search/overview/fit journey; sourced career graph; DM two-account results; purchase facade with test-provider reconciliation. |
| Sunday afternoon | Full mobile/desktop and failure-state pass; learning replay; auth/privacy checks; remaining blockers named with owner and next action. |
| Sunday release review | Unit/build and relevant integration gates pass on the combined commit; actual enabled capabilities listed; rollback plan; owner reviews merge/deploy. |

If a checkpoint is missed, post the concrete impact immediately. Do not silently redefine a disabled or fixture-only feature as “fully realized.” Exact release time remains an owner decision.

## Shared completion checklist

- [ ] Claude has acknowledged the handoff and branch ownership.
- [ ] Designer/house source registry and Vogue overview coverage verified.
- [ ] Both overview directions resolve the exact designer-house search intersection.
- [ ] Clothing remains within query constraints and respects taste without invented credits.
- [ ] Pagination has no duplicates/skips in its supported snapshot window.
- [ ] Missing/estimated/measured sizing states are accurate end to end.
- [ ] Reason-specific corrections change only the intended preference and support undo.
- [ ] DM works between two authorized test accounts with block/retry/access negatives.
- [ ] Purchase hub distinguishes intent, fee, payment, self-report, and merchant confirmation.
- [ ] Map, upload, and connection capabilities reflect real data, consent, and service availability.
- [ ] Mobile/desktop UI, keyboard use, reduced motion, empty/error/offline states verified.
- [ ] Combined commit passes required gates; remaining provider dependencies disclosed.
- [ ] Owner has reviewed the concrete release and authorized merge/deployment.
