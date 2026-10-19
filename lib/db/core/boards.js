// lib/db/core/boards.js — MOODBOARDS.
//
// A board is shareable by id, which is why its reads are written to be safe for
// someone who is not its owner. The caps (MAX_BOARDS_PER_USER,
// MAX_ITEMS_PER_BOARD) raise a RangeError carrying a `code`, so a route can
// tell a person WHICH limit they reached rather than failing generically.
//
// commitBoardSave is the counterpart to commitInteractionBatch: saving to a
// board is the strongest taste signal in the product, so the board row, the
// event, the edges and the popularity all land in one transaction.

import { EVENT_INSERT_SQL, memRecordEvent, normalizeEvent } from "./events.js";
import { bumpEdges, writeEdges } from "./graph.js";
import { bumpPopularity, writePopularity } from "./popularity.js";
import { getPool } from "./pool.js";
import { mem, withUserLock } from "./store.js";
import { randomUUID } from "node:crypto";

// ---- Boards (Pinterest-style moodboards; shareable by id) ----------------------

function newBoardId() {
  return "b-" + randomUUID();
}

export const MAX_BOARDS_PER_USER = 50;
export const MAX_ITEMS_PER_BOARD = 500;

function capacityError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

export async function createBoard(userId, name) {
  const board = { id: newBoardId(), userId, name, items: [], isDefault: false };
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      const existing = Array.from(mem.boards.values()).filter((entry) => entry.userId === userId);
      if (existing.length >= MAX_BOARDS_PER_USER) {
        throw capacityError("BOARD_LIMIT", `board limit is ${MAX_BOARDS_PER_USER}`);
      }
      board.isDefault = !Array.from(mem.boards.values()).some((entry) => entry.userId === userId && entry.isDefault);
      mem.boards.set(board.id, board);
      return board;
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    const boardCount = await client.query("SELECT count(*)::int AS n FROM boards WHERE user_id=$1", [userId]);
    if ((boardCount.rows[0]?.n || 0) >= MAX_BOARDS_PER_USER) {
      throw capacityError("BOARD_LIMIT", `board limit is ${MAX_BOARDS_PER_USER}`);
    }
    const current = await client.query(
      "SELECT 1 FROM boards WHERE user_id=$1 AND is_default=true LIMIT 1", [userId]);
    board.isDefault = !current.rowCount;
    await client.query(
      "INSERT INTO boards (id,user_id,name,is_default) VALUES ($1,$2,$3,$4)",
      [board.id, userId, name, board.isDefault]
    );
    await client.query("COMMIT");
    return board;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getBoards(userId) {
  const p = await getPool();
  if (!p) {
    return Array.from(mem.boards.values()).filter((b) => b.userId === userId);
  }
  const { rows } = await p.query(
    `SELECT b.id,b.user_id,b.name,b.is_default,
       COALESCE(jsonb_agg(bi.item ORDER BY bi.created_at) FILTER (WHERE bi.item_id IS NOT NULL),'[]'::jsonb) AS items
     FROM boards b LEFT JOIN board_items bi ON bi.board_id=b.id
     WHERE b.user_id=$1 GROUP BY b.id,b.user_id,b.name,b.is_default,b.created_at
     ORDER BY b.is_default DESC,b.created_at`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, name: r.name,
    isDefault: r.is_default === true, items: r.items || [],
  }));
}

export async function getBoard(boardId) {
  const p = await getPool();
  if (!p) return mem.boards.get(boardId) || null;
  return boardFromTarget(p, boardId);
}

async function boardFromTarget(target, boardId) {
  const { rows } = await target.query(
    `SELECT b.id,b.user_id,b.name,b.is_default,
       COALESCE(jsonb_agg(bi.item ORDER BY bi.created_at) FILTER (WHERE bi.item_id IS NOT NULL),'[]'::jsonb) AS items
     FROM boards b LEFT JOIN board_items bi ON bi.board_id=b.id
     WHERE b.id=$1 GROUP BY b.id,b.user_id,b.name,b.is_default`, [boardId]
  );
  return rows[0]
    ? { id: rows[0].id, userId: rows[0].user_id, name: rows[0].name,
        isDefault: rows[0].is_default === true, items: rows[0].items || [] }
    : null;
}

// Adds an item to a board (idempotent). Returns the updated board.
export async function addBoardItem(boardId, item) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board) return null;
    if (!board.items.some((x) => x.id === item.id)) board.items.push(item);
    return board;
  }
  await p.query(
    `INSERT INTO board_items (board_id,item_id,item) VALUES ($1,$2,$3)
     ON CONFLICT (board_id,item_id) DO NOTHING`,
    [boardId, item.id, JSON.stringify(item)]
  );
  return getBoard(boardId);
}

// Atomic board save + derived learning. The unique board/item key makes retries
// harmless, while the transaction prevents a saved item without its event.
export async function commitBoardSave({ userId, boardId = null, defaultName = "moodboard", item,
  canonicalEvent, reduce, priorLimit = 10 }) {
  const p = await getPool();
  if (!p) {
    return withUserLock(userId, async () => {
      let board = boardId ? mem.boards.get(boardId) : null;
      if (boardId && (!board || board.userId !== userId)) return { board: null, inserted: false };
      if (!board) {
        board = Array.from(mem.boards.values()).find((entry) => entry.userId === userId && entry.isDefault) ||
          Array.from(mem.boards.values()).find((entry) => entry.userId === userId);
      }
      if (!board) {
        board = { id: newBoardId(), userId, name: defaultName, items: [], isDefault: true };
        mem.boards.set(board.id, board);
      } else if (!board.isDefault && !Array.from(mem.boards.values()).some((entry) =>
        entry.userId === userId && entry.isDefault)) {
        board.isDefault = true;
      }
      if (board.items.some((entry) => entry.id === item.id)) return { board, inserted: false };
      if (board.items.length >= MAX_ITEMS_PER_BOARD) {
        throw capacityError("BOARD_ITEM_LIMIT", `board item limit is ${MAX_ITEMS_PER_BOARD}`);
      }
      const event = normalizeEvent(typeof canonicalEvent === "function"
        ? canonicalEvent(board.id) : canonicalEvent);
      const priorItems = board.items.slice(-priorLimit);
      const derived = reduce(mem.profiles.get(userId) || {}, priorItems);
      board.items.push(item);
      mem.profiles.set(userId, derived.profile);
      memRecordEvent(event);
      mem.interactions.push({ userId, itemId: item.id, action: "save", dwellMs: null, at: Date.now() });
      await Promise.all([bumpEdges(derived.edgePairs, userId), bumpPopularity(derived.popularity, userId)]);
      return { board, inserted: true };
    });
  }
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`user-lock:${userId}`]);
    let resolvedBoardId = boardId;
    if (resolvedBoardId) {
      const owner = await client.query(
        "SELECT id FROM boards WHERE id=$1 AND user_id=$2 FOR UPDATE", [resolvedBoardId, userId]);
      if (!owner.rowCount) {
        await client.query("ROLLBACK");
        return { board: null, inserted: false };
      }
    } else {
      let target = await client.query(
        `SELECT id FROM boards WHERE user_id=$1 AND is_default=true
         ORDER BY created_at,id LIMIT 1 FOR UPDATE`, [userId]);
      if (!target.rowCount) {
        target = await client.query(
          "SELECT id FROM boards WHERE user_id=$1 ORDER BY created_at,id LIMIT 1 FOR UPDATE", [userId]);
        if (target.rowCount) {
          await client.query("UPDATE boards SET is_default=true WHERE id=$1", [target.rows[0].id]);
        } else {
          resolvedBoardId = newBoardId();
          await client.query(
            "INSERT INTO boards (id,user_id,name,is_default) VALUES ($1,$2,$3,true)",
            [resolvedBoardId, userId, defaultName]
          );
        }
      }
      if (!resolvedBoardId) resolvedBoardId = target.rows[0].id;
    }
    const event = normalizeEvent(typeof canonicalEvent === "function"
      ? canonicalEvent(resolvedBoardId) : canonicalEvent);
    const existingItem = await client.query(
      "SELECT 1 FROM board_items WHERE board_id=$1 AND item_id=$2", [resolvedBoardId, item.id]
    );
    if (existingItem.rowCount) {
      await client.query("COMMIT");
      return { board: await boardFromTarget(client, resolvedBoardId), inserted: false };
    }
    const boardSize = await client.query(
      "SELECT count(*)::int AS n FROM board_items WHERE board_id=$1", [resolvedBoardId]
    );
    if ((boardSize.rows[0]?.n || 0) >= MAX_ITEMS_PER_BOARD) {
      throw capacityError("BOARD_ITEM_LIMIT", `board item limit is ${MAX_ITEMS_PER_BOARD}`);
    }
    const prior = await client.query(
      "SELECT item FROM board_items WHERE board_id=$1 ORDER BY created_at DESC LIMIT $2", [resolvedBoardId, priorLimit]
    );
    const inserted = await client.query(
      `INSERT INTO board_items (board_id,item_id,item) VALUES ($1,$2,$3)
       ON CONFLICT (board_id,item_id) DO NOTHING RETURNING item_id`,
      [resolvedBoardId, item.id, JSON.stringify(item)]
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { board: await boardFromTarget(client, resolvedBoardId), inserted: false };
    }
    await client.query(
      "INSERT INTO profiles (user_id,vec) VALUES ($1,'{}'::jsonb) ON CONFLICT (user_id) DO NOTHING", [userId]
    );
    const current = await client.query("SELECT vec FROM profiles WHERE user_id=$1 FOR UPDATE", [userId]);
    const derived = reduce(current.rows[0]?.vec || {}, prior.rows.map((row) => row.item));
    await client.query("UPDATE profiles SET vec=$2,updated_at=now() WHERE user_id=$1", [userId, JSON.stringify(derived.profile)]);
    await client.query(EVENT_INSERT_SQL, [event.userId, event.type, event.payloadJson, event.at]);
    await client.query(
      "INSERT INTO interactions (user_id,item_id,action,dwell_ms) VALUES ($1,$2,'save',NULL)", [userId, item.id]
    );
    await writeEdges(client, derived.edgePairs, userId);
    await writePopularity(client, derived.popularity, userId);
    await client.query("COMMIT");
    return { board: await boardFromTarget(client, resolvedBoardId), inserted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function removeBoardItem(boardId, itemId, userId = null) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board || (userId && board.userId !== userId)) return null;
    board.items = board.items.filter((x) => x.id !== itemId);
    return board;
  }
  const removed = await p.query(
    `DELETE FROM board_items AS item USING boards AS board
     WHERE item.board_id=board.id AND item.board_id=$1 AND item.item_id=$2
       AND ($3::text IS NULL OR board.user_id=$3)`,
    [boardId, itemId, userId]
  );
  if (!removed.rowCount && userId) {
    const owner = await p.query("SELECT 1 FROM boards WHERE id=$1 AND user_id=$2", [boardId, userId]);
    if (!owner.rowCount) return null;
  }
  return getBoard(boardId);
}

export async function renameBoard(boardId, name, userId = null) {
  const p = await getPool();
  if (!p) {
    const board = mem.boards.get(boardId);
    if (!board || (userId && board.userId !== userId)) return null;
    board.name = name;
    return board;
  }
  const renamed = await p.query(
    "UPDATE boards SET name=$2 WHERE id=$1 AND ($3::text IS NULL OR user_id=$3)",
    [boardId, name, userId]
  );
  if (!renamed.rowCount) return null;
  return getBoard(boardId);
}
