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
import {
  getProfile, saveProfile, recordInteraction,
  createBoard, getBoards, getBoard, addBoardItem, removeBoardItem, renameBoard,
  bumpEdges, bumpPopularity, withUserLock,
} from "../../../lib/db/index.js";

export const dynamic = "force-dynamic";

const BOARD_EDGE_W = 2;   // board co-membership: strongest graph edge
const BOARD_EDGE_SPAN = 10; // link the new item to this many board items

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("id");
  if (boardId) {
    const board = await getBoard(boardId);
    if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
    return NextResponse.json({ board, vector: itemsVector(board.items) });
  }
  const userId = searchParams.get("user");
  if (!userId) return NextResponse.json({ error: "user or id required" }, { status: 400 });
  return NextResponse.json({ boards: await getBoards(userId) });
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const userId = body.user || "guest";
  const item = body.item || null;

  // Create-only call.
  if (!item) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name or item required" }, { status: 400 });
    return NextResponse.json({ board: await createBoard(userId, name) });
  }
  if (!item.id) {
    return NextResponse.json({ error: "item.id required" }, { status: 400 });
  }

  // Resolve target board: explicit id, else the user's first board, else a new
  // default board.
  let board = null;
  if (body.boardId) {
    board = await getBoard(body.boardId);
    if (!board || board.userId !== userId) {
      return NextResponse.json({ error: "board not found" }, { status: 404 });
    }
  } else {
    const boards = await getBoards(userId);
    board = boards[0] || (await createBoard(userId, "moodboard"));
  }

  const priorItems = board.items || [];
  board = await addBoardItem(board.id, item);

  // Board co-membership edges + learning + popularity.
  const pairs = priorItems
    .slice(-BOARD_EDGE_SPAN)
    .map((x) => ({ a: x.id, b: item.id, w: BOARD_EDGE_W }));
  await Promise.all([
    bumpEdges(pairs),
    withUserLock(userId, async () => {
      const profile = learn((await getProfile(userId)) || {}, item, "save");
      await saveProfile(userId, profile);
    }),
    bumpPopularity([{ id: item.id, eng: 1 }]),
    recordInteraction(userId, item.id, "save"),
  ]);

  return NextResponse.json({ board });
}

// Ownership check shared by mutating verbs.
async function ownedBoard(body) {
  const board = body.boardId ? await getBoard(body.boardId) : null;
  if (!board || board.userId !== (body.user || "guest")) return null;
  return board;
}

export async function DELETE(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const board = await ownedBoard(body);
  if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  if (!body.itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  return NextResponse.json({ board: await removeBoardItem(board.id, body.itemId) });
}

export async function PATCH(req) {
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const board = await ownedBoard(body);
  if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  return NextResponse.json({ board: await renameBoard(board.id, name) });
}
