// lib/db/dm.js — THE MAIL DESK. SERVER-ONLY. (schema v40-v43)
//
// THERE IS NO MEMORY-MODE MIRROR, AND THAT IS THE POINT.
//
// Every other lib/db module ships a mem branch so the unit suite can run
// without Postgres. This one refuses instead, and the red team's last finding
// is why: the DM laws are triggers — a block stops delivery both ways, a
// closed passport receives nothing, a business cannot be closed, one knock
// until a reply. A JS mirror written from that same prose is a SECOND
// implementation of the law, and the unit suite would then certify the second
// one while production runs the first. The store already records that exact
// failure happening in this codebase: "Every unit test runs mem, which is why
// it survived."
//
// So the laws are proven in tests/postgres-integration.test.js against a real
// database, and mem mode says "unavailable" rather than approximating. A
// developer without Postgres gets an honest refusal; they do not get a
// messaging system that behaves differently from the one users have.
//
// THIS FILE IS THE DOOR. The 1,746 lines that used to live here are in ./dm/,
// and every caller still imports from "@/lib/db/dm" exactly as before. The
// re-exports are listed by name rather than `export *`, so accountId(),
// pool() and orderPair() — which the modules borrow from each other — stay
// private, and so that this block IS the mail desk's public API: 46 exports,
// pinned by scripts/db-export-surface.mjs.

// the primitives every module here stands on, and the two errors it raises
export {
  MessageRefused,
  MessagingUnavailable,
  pairLockKey,
} from "./dm/core.js";

// a conversation: opening it, saying something, reading it back
export {
  listFolder,
  markRead,
  openConversation,
  readThread,
  sendMessage,
  unreadSummary,
  visibleBody,
} from "./dm/threads.js";

// who may reach you — accept, decline, block, unblock
export {
  acceptRequest,
  blockAccount,
  blockByConversation,
  declineRequest,
  declineRequestDetailed,
  iBlocked,
  listBlocks,
  unblockAccount,
  unblockByConversation,
  unblockByHandle,
} from "./dm/consent.js";

// §6: handing someone the record of conversations they were in
export {
  exportMessagesFor,
} from "./dm/export.js";

// who is on the other end, and who may be addressed at all
export {
  findAddressees,
  handlesFor,
  peerOf,
  peerOfMessage,
  pendingKnockBy,
  pendingKnockToHandle,
  resolveAddressee,
} from "./dm/people.js";

// a person's own controls: signals, open/closed, media consent
export {
  mediaConsentGiven,
  readDmsOpen,
  recipientFollowsSender,
  setDmSettings,
  setDmsOpen,
  setMediaConsent,
} from "./dm/settings.js";

// read receipts and typing — reciprocal or not at all
export {
  TYPING_TTL_SECONDS,
  clearTyping,
  peerActivity,
  pingTyping,
  readActivitySignals,
  setActivitySignals,
  sweepTyping,
} from "./dm/activity.js";

// marks on a message, and taking one back
export {
  react,
  reactionKinds,
  reactionsFor,
  unsendMessage,
} from "./dm/reactions.js";

// silence the badge, and nothing else
export {
  setMuted,
} from "./dm/mute.js";
