// tests/lostness.test.js — the task-success / lostness vocabulary (V.2 §13).
import test from "node:test";
import assert from "node:assert/strict";
import { TASKS, backtracks, closeTask, lostness, summarizeTasks } from "../lib/analytics/lostness.js";
import { EVENTS, buildEvent } from "../lib/events/index.js";

test("Smith's lostness: a straight line is 0, wandering is lost, backtracks count", () => {
  assert.deepEqual(lostness(["feed", "detail"], 2), { L: 0, N: 2, S: 2, R: 2, lost: false });
  const wander = lostness(["feed", "search", "feed", "search", "feed", "detail"], 2);
  assert.ok(wander.L >= 0.5 && wander.lost, JSON.stringify(wander));
  assert.equal(lostness([], 2).N, 0);
  assert.equal(backtracks(["a", "b", "a", "b", "c"]), 2);
  assert.equal(backtracks(["a", "a", "a"]), 0, "staying put is not a backtrack");
});

test("a closed task record carries outcome, lostness and backtracks, never a query or a body; aggregates per task", () => {
  const ok = closeTask({ task: TASKS.FIND_PIECE, outcome: "succeeded", path: ["feed", "search", "detail"], startedAt: 1000, endedAt: 4000 });
  assert.equal(ok.ms, 3000); assert.equal(ok.lost, false);
  const lost = closeTask({ task: TASKS.FIND_PIECE, outcome: "abandoned", path: ["feed", "search", "feed", "search", "feed", "search", "feed"] });
  assert.equal(lost.lost, true); assert.equal(lost.ms, null);
  assert.throws(() => closeTask({ task: "nope", outcome: "succeeded" }));
  assert.throws(() => closeTask({ task: TASKS.FIND_PIECE, outcome: "meh" }));
  const sum = summarizeTasks([ok, lost]);
  assert.deepEqual(sum, [{ task: "find-piece", n: 2, successRate: 0.5, meanLostness: Math.round(((ok.lostness + lost.lostness) / 2) * 1000) / 1000, lostShare: 0.5 }]);
  assert.equal(JSON.stringify(ok).includes("query"), false);
});

test("the event vocabulary names task start, success and abandonment", () => {
  assert.equal(EVENTS.TASK_STARTED, "TASK_STARTED"); assert.equal(EVENTS.TASK_SUCCEEDED, "TASK_SUCCEEDED"); assert.equal(EVENTS.TASK_ABANDONED, "TASK_ABANDONED");
  assert.equal(buildEvent("u", EVENTS.TASK_SUCCEEDED, { task: "find-piece", lostness: 0 }).type, "TASK_SUCCEEDED");
});
