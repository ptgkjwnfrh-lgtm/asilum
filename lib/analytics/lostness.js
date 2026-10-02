// lib/analytics/lostness.js — THE SMALL ANALYTICS VOCABULARY FOR TASK SUCCESS
// AND LOSTNESS (V.2 brief §13). Pure and client-safe.
//
// A task is a named thing a person set out to do ("find a piece", "write to
// a passenger", "stamp a place"). It STARTS, then SUCCEEDS or is ABANDONED;
// along the way the pages visited are recorded. Lostness is Smith's measure:
//
//   L = sqrt( (N/S − 1)² + (R/N − 1)² )
//
//   S = distinct pages visited, N = total page visits, R = the minimum
//   number of pages the task needs. 0 = a straight line; ≥ 0.5 reads as lost
//   (Smith 1996's threshold, kept as the default and reported, not assumed).
//
// No dwell time anywhere: the brief says dwell alone is weak and can mean
// confusion. Nothing here identifies a person; the vocabulary carries task
// names and page names, never queries or message text.

export const TASKS = Object.freeze({
  FIND_PIECE: "find-piece", OPEN_DETAIL: "open-detail", WRITE_PASSENGER: "write-passenger",
  STAMP_PLACE: "stamp-place", STAMP_PASSENGER: "stamp-passenger", GIFT_PIECE: "gift-piece",
  SEARCH_MESSAGES: "search-messages", COMPOSE_POST: "compose-post",
});
export const TASK_OUTCOMES = Object.freeze(["succeeded", "abandoned"]);
export const LOST_THRESHOLD = 0.5;

/** The minimum page count a task needs, by task — the R in Smith's measure. */
export const TASK_MIN_PAGES = Object.freeze({
  "find-piece": 2, "open-detail": 2, "write-passenger": 3, "stamp-place": 3, "stamp-passenger": 3,
  "gift-piece": 3, "search-messages": 2, "compose-post": 2,
});

/** Smith's lostness for one path of page names. Pure. */
export function lostness(path = [], minPages = 1) {
  const pages = (path || []).map(String).filter(Boolean);
  const N = pages.length;
  if (!N) return { L: 0, N: 0, S: 0, R: minPages, lost: false };
  const S = new Set(pages).size;
  const R = Math.max(1, Math.min(minPages, N));
  const L = Math.sqrt(Math.pow(N / S - 1, 2) + Math.pow(R / N - 1, 2));
  return { L: Math.round(L * 1000) / 1000, N, S, R, lost: L >= LOST_THRESHOLD };
}

/** Did a path backtrack (A → B → A)? Counts the returns; a signal, not a verdict. */
export function backtracks(path = []) {
  let n = 0;
  for (let i = 2; i < path.length; i++) if (path[i] === path[i - 2] && path[i] !== path[i - 1]) n++;
  return n;
}

/** One task record, closed. `path` is the pages visited since the start. */
export function closeTask({ task, outcome, path = [], startedAt, endedAt = Date.now() }) {
  if (!Object.values(TASKS).includes(task)) throw new Error("unknown task: " + task);
  if (!TASK_OUTCOMES.includes(outcome)) throw new Error("unknown outcome: " + outcome);
  const l = lostness(path, TASK_MIN_PAGES[task] || 1);
  return { task, outcome, pages: l.N, distinct: l.S, lostness: l.L, lost: l.lost, backtracks: backtracks(path), ms: Number.isFinite(startedAt) ? Math.max(0, endedAt - startedAt) : null };
}

/** Aggregate closed task records: success rate and lostness per task. */
export function summarizeTasks(records = []) {
  const by = Object.create(null);
  for (const r of records) {
    const b = by[r.task] || (by[r.task] = { task: r.task, n: 0, succeeded: 0, lostSum: 0, lostCount: 0 });
    b.n++; if (r.outcome === "succeeded") b.succeeded++; b.lostSum += r.lostness; if (r.lost) b.lostCount++;
  }
  return Object.values(by).map((b) => ({ task: b.task, n: b.n, successRate: Math.round((b.succeeded / b.n) * 100) / 100, meanLostness: Math.round((b.lostSum / b.n) * 1000) / 1000, lostShare: Math.round((b.lostCount / b.n) * 100) / 100 }));
}
