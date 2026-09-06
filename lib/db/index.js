// lib/db/index.js
// Persistence layer. Uses Postgres (Neon/Supabase) when DATABASE_URL is set,
// otherwise falls back to an in-memory store so the app runs locally and in
// preview deploys before a database is connected.
//
// Stores: profiles (taste vectors), interactions (event log), edges (the
// Pinterest-style item-to-item co-engagement graph), popularity (TikTok-style
// engagement/impression counters), and boards (user moodboards).
//
// Secrets (DATABASE_URL) are provided via environment variables on the deploy
// platform. This file never hard-codes credentials.
//
// THIS FILE IS THE DOOR. The 1,724 lines that used to live here are in
// ./core/, one module per store, and every caller still imports from
// "@/lib/db" exactly as before.
//
// THE RE-EXPORTS ARE EXPLICIT ON PURPOSE. `export *` would have been three
// lines shorter and would have published every helper a sibling module needs
// to borrow — `mem`, `edgeKey`, `writeEdges`, `verifySchema` were all private
// before the split and would have become public by accident. Listing the
// names means this block IS the public API of the persistence layer: 51
// exports, pinned by scripts/db-export-surface.mjs, LOST none / gained none.
//
// It also means adding an export is a deliberate act. A newcomer who writes a
// new function in ./core/ and expects it to appear here will find it does not,
// and will have to decide whether it belongs to the outside world.

// the connection itself, and the two schema probes that decide what the rest may assume
export {
  databaseSslConfig,
  getPool,
  hasDecayColumns,
  resetDecayColumnCache,
} from "./core/pool.js";

// the in-memory fallback's public face — erasure, the pseudonymous id, the per-user write lock
export {
  identityHash,
  purgeMemoryUserData,
  withUserLock,
} from "./core/store.js";

// the catalog rows this layer owns, and the candidate read search sits on
export {
  getItem,
  getItems,
  listItemBrands,
  listItems,
  searchItemCandidates,
  upsertItems,
} from "./core/items.js";

// the v1 vector seam
export {
  getEmbeddingSnapshot,
  invalidateEmbeddingSnapshots,
  listEmbeddings,
  saveEmbeddings,
} from "./core/embeddings.js";

// taste vectors — read, write, and the read-modify-write that must go through the lock
export {
  getProfile,
  listTasteVectors,
  mutateProfile,
  saveProfile,
} from "./core/profiles.js";

// the event log, and the batch commit that is one transaction or nothing
export {
  commitInteractionBatch,
  getInteractions,
  recordInteraction,
} from "./core/interactions.js";

// canonical event history, and moving a device's history onto an account
export {
  EVENT_INSERT_SQL,
  adoptMemoryCoreData,
  adoptMemoryLedgers,
  countEvents,
  countMemInteractions,
  countMemLedgers,
  countMemOperations,
  listEvents,
  memAdoptEvents,
  memRecordEvent,
  normalizeEvent,
  recordEvent,
} from "./core/events.js";

// the item-to-item co-engagement graph
export {
  bumpEdges,
  getEdges,
} from "./core/graph.js";

// engagement and impression counters
export {
  bumpPopularity,
  getPopularity,
} from "./core/popularity.js";

// moodboards and their items
export {
  MAX_BOARDS_PER_USER,
  MAX_ITEMS_PER_BOARD,
  addBoardItem,
  commitBoardSave,
  createBoard,
  getBoard,
  getBoards,
  removeBoardItem,
  renameBoard,
} from "./core/boards.js";

// aggregates for the dashboard
export {
  getStats,
  getStatsSnapshot,
} from "./core/stats.js";
