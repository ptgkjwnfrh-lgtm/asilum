// Compatibility tombstone for the retired hand-written overview registry.
// Public overview prose now comes only from revision-pinned Wikipedia records
// through lib/people/resolve.js. Keeping these exports empty makes any stale
// consumer fail closed instead of rendering the former editorial paragraph.

export const OVERVIEW_ELIGIBILITY = Object.freeze({ retired: true });
export const OVERVIEWS = Object.freeze([]);
export function findOverview() { return null; }
export function overviewById() { return null; }
