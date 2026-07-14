// lib/tickets.js
// Shared purchase-ticket constants (client-safe — no db imports).
// ASILUM is a third-party purchase ASSISTANT: it never fulfills, ships,
// tracks, or handles returns. The original marketplace/seller does.

export const DISCLAIMER_VERSION = "v2-2026-07";

export const DISCLAIMER_TEXT =
  "ASILUM helps you request and complete purchases from third-party shopping " +
  "platforms. This item is sold, shipped, fulfilled, and serviced by the " +
  "original marketplace, seller, or shopping platform, not ASILUM. Order " +
  "confirmation, shipping updates, tracking, returns, cancellations, and " +
  "customer support may come directly from the original platform. ASILUM " +
  "does not independently authenticate listings or sellers; review the " +
  "source platform's authenticity, buyer-protection, and dispute policies " +
  "before continuing. By " +
  "continuing, you authorize ASILUM to use the shipping information you " +
  "provide for this purchase request and to help complete the checkout " +
  "process on the original source site when permitted.";

export const DISCLAIMER_CHECKBOX =
  "I understand this item is fulfilled by a third-party marketplace or " +
  "seller, and I authorize ASILUM to use my provided shipping information " +
  "to assist with this purchase.";
