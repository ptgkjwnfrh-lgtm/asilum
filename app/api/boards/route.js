// app/api/boards/route.js
// Pinterest-style moodboards.
//   GET    /api/boards?user=<id>      -> the user's boards (with items)
//   GET    /api/boards?id=<boardId>   -> one board by id (public share view)
//   POST   /api/boards { user, name }          -> create a named board
//   POST   /api/boards { user, item }          -> save item to the default board
//   POST   /api/boards { user, boardId, item } -> save item to a specific board
//   DELETE /api/boards { user, boardId, itemId } -> remove an item
//   PATCH  /api/boards { user, boardId, name }   -> rename a board
// Saving is a strong taste signal AND builds the co-engagement graph: the new
// item gets linked to every item already on the board (board co-membership is
// the strongest edge, exactly the signal Pinterest's taste graph is built on).

import { NextResponse } from "next/server";
import { learn, itemsVector } from "../../../lib/brain/index.js";
import { createBoard, getBoards, getBoard, removeBoardItem, renameBoard, commitBoardSave } from "../../../lib/db/index.js";
import { EVENTS, buildEvent } from "../../../lib/events/index.js";
import { resolveRequestUser } from "../../../lib/identity.js";
import { publicProduct, resolveProduct } from "../../../lib/products.js";
import { consumeRateLimit, consumeGlobalBudget, rateLimitResponse } from "../../../lib/security/rateLimit.js";
import { readJsonRequest } from "../../../lib/security/json.js";
import { requestSubject } from "../../../lib/security/request.js";

export const dynamic = "force-dynamic";

const BOARD_EDGE_W = 2;   // board co-membership: strongest graph edge
const BOARD_EDGE_SPAN = 10; // link the new item to this many board items
const cleanBoard = (board, { includeOwner = true } = {}) => {
  if (!board) return null;
  const safe = { ...board, items: (board.items || []).map(publicProduct).filter(Boolean) };
  if (!includeOwner) delete safe.userId;
  return safe;
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const quota = await consumeRateLimit({ scope: "boards-read", subject: requestSubject(req), limit: 120, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const boardId = searchParams.get("id");
  if (boardId) {
    if (boardId.length > 80) return NextResponse.json({ error: "invalid board id" }, { status: 400 });
    const board = await getBoard(boardId);
    if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
    const viewerClaim = searchParams.get("viewer") || "";
    const viewer = viewerClaim ? await resolveRequestUser(req, viewerClaim) : null;
    const safe = cleanBoard(board, { includeOwner: false });
    return NextResponse.json({ board: safe, owned: viewer === board.userId, vector: itemsVector(safe.items) });
  }
  const claimedUser = searchParams.get("user");
  if (!claimedUser) return NextResponse.json({ error: "user or id required" }, { status: 400 });
  const userId = await resolveRequestUser(req, claimedUser);
  if (!userId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  return NextResponse.json({ boards: (await getBoards(userId)).map(cleanBoard) });
}

export async function POST(req) {
  const parsed = await readJsonRequest(req);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const quota = await consumeRateLimit({ scope: "boards", subject: userId, limit: 20, windowMs: 60_000 });
  if (!quota.allowed) {
    return NextResponse.json(rateLimitResponse(quota), {
      status: 429, headers: { "Retry-After": String(Math.ceil(quota.retryAfterMs / 1000)) },
    });
  }
  // (audit #20) aggregate write breaker — a board save writes board_items,
  // a canonical event, and the strongest co-engagement edge signal.
  const globalQuota = await consumeGlobalBudget("boards");
  if (!globalQuota.allowed) {
    return NextResponse.json(rateLimitResponse(globalQuota), {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(globalQuota.retryAfterMs / 1000))) },
    });
  }
  const requestedItem = body.item || null;

  // Create-only call.
  if (!requestedItem) {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "name or item required" }, { status: 400 });
    try {
      return NextResponse.json({ board: await createBoard(userId, name) });
    } catch (error) {
      if (error?.code === "BOARD_LIMIT") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: "board creation failed" }, { status: 500 });
    }
  }
  if (typeof requestedItem.id !== "string" || !requestedItem.id || requestedItem.id.length > 80) {
    return NextResponse.json({ error: "item.id required" }, { status: 400 });
  }
  const item = await resolveProduct(requestedItem.id);
  if (!item) return NextResponse.json({ error: "unknown product" }, { status: 400 });

  // Explicit boards are validated inside the same transaction as the save.
  if (body.boardId) {
    if (typeof body.boardId !== "string" || body.boardId.length > 80) {
      return NextResponse.json({ error: "invalid board id" }, { status: 400 });
    }
  }

  let saved;
  try {
    saved = await commitBoardSave({
      userId, boardId: body.boardId || null, item,
      canonicalEvent: (resolvedBoardId) => buildEvent(userId, EVENTS.USER_ADDED_TO_MOOD_BOARD,
        { itemId: item.id, brand: item.brand, boardId: resolvedBoardId }),
      priorLimit: BOARD_EDGE_SPAN,
      reduce(profile, priorItems) {
        return {
          profile: learn(profile || {}, item, "save"),
          edgePairs: priorItems.map((x) => ({ a: x.id, b: item.id, w: BOARD_EDGE_W })),
          popularity: [{ id: item.id, eng: 1 }],
        };
      },
    });
  } catch (error) {
    if (error?.code === "BOARD_ITEM_LIMIT") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "board save failed" }, { status: 500 });
  }
  if (!saved.board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  return NextResponse.json({ board: cleanBoard(saved.board), duplicate: !saved.inserted });
}

// Ownership check shared by mutating verbs.
async function ownedBoard(req, body) {
  if (typeof body.boardId !== "string" || !body.boardId || body.boardId.length > 80) return null;
  const userId = await resolveRequestUser(req, body.user || "");
  if (!userId) return null;
  const board = body.boardId ? await getBoard(body.boardId) : null;
  if (!board || board.userId !== userId) return null;
  return board;
}

export async function DELETE(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const board = await ownedBoard(req, body);
  if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  const quota = await consumeRateLimit({ scope: "boards-mutate", subject: board.userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  if (typeof body.itemId !== "string" || !body.itemId || body.itemId.length > 80) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }
  const updated = await removeBoardItem(board.id, body.itemId, board.userId);
  if (!updated) return NextResponse.json({ error: "board ownership changed" }, { status: 409 });
  return NextResponse.json({ board: cleanBoard(updated) });
}

export async function PATCH(req) {
  const parsed = await readJsonRequest(req, { maxBytes: 16 * 1024 });
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const board = await ownedBoard(req, body);
  if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  const quota = await consumeRateLimit({ scope: "boards-mutate", subject: board.userId, limit: 60, windowMs: 60_000 });
  if (!quota.allowed) return NextResponse.json(rateLimitResponse(quota), { status: 429 });
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const updated = await renameBoard(board.id, name, board.userId);
  if (!updated) return NextResponse.json({ error: "board ownership changed" }, { status: 409 });
  return NextResponse.json({ board: cleanBoard(updated) });
}
