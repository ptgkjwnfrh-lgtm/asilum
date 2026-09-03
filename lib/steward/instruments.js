// lib/steward/instruments.js — the seven instruments, run as one movement.
//
// The comprehension rounds of 21–22 August left seven measurement scripts
// under scripts/measure-*.mjs, each a PASS/FAIL harness over the shipped
// catalog. They ran when a person remembered to run them. This runs them in
// one call, keeps each one's last line and exit code, and gives the steward a
// number to compare against the previous recorded run — MOVEMENT, which is
// the thing a nightly watcher exists to notice.
//
// They are NOT a check. A check that cannot be measured is `unmeasurable` and
// darkens the board; the instruments take ~20s of CPU and cannot run inside
// a 60s serverless cron, so on that path they would be permanently dark and
// the board would be permanently ignored (#281's lesson). They are a section
// of the run instead: present when they ran, absent when they did not, and a
// run that did not run them says so.

import { spawn } from "node:child_process";

export const INSTRUMENTS = Object.freeze([
  { id: "vibe-sweep", script: "scripts/measure-vibe-sweep.mjs" },
  { id: "attribute-reading", script: "scripts/measure-attribute-reading.mjs" },
  { id: "evidence-hygiene", script: "scripts/measure-evidence-hygiene.mjs" },
  { id: "lexical-fidelity", script: "scripts/measure-lexical-fidelity.mjs" },
  { id: "assisted-interpretation", script: "scripts/measure-assisted-interpretation.mjs" },
  { id: "cultural-reach", script: "scripts/measure-cultural-reach.mjs" },
  { id: "composed-disclosure", script: "scripts/measure-composed-disclosure.mjs" },
]);

function runOne(inst, { root, node, timeoutMs }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let out = "";
    const child = spawn(node, [inst.script], { cwd: root, env: { ...process.env, DATABASE_URL: "" } });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      const defects = /(\d+)\s+defect/.exec(out);
      const failed = code !== 0 || signal !== null || /\bFAIL\b/.test(out) || (defects && Number(defects[1]) > 0);
      resolve({
        id: inst.id,
        ok: !failed,
        code: signal ? `killed:${signal}` : code,
        ms: Date.now() - started,
        last: last.slice(0, 200),
        defects: defects ? Number(defects[1]) : null,
      });
    });
  });
}

/**
 * Run every instrument, sequentially — each one loads the whole catalog and
 * running seven at once on a CI runner has thrashed before.
 */
export async function runInstruments({ root, node = process.execPath, timeoutMs = 180000 } = {}) {
  const started = Date.now();
  const results = [];
  for (const inst of INSTRUMENTS) results.push(await runOne(inst, { root, node, timeoutMs }));
  return {
    ran: true,
    ranAt: new Date().toISOString(),
    pass: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
    ms: Date.now() - started,
    results,
  };
}

/**
 * What changed between two instrument runs. Returns sentences; an empty
 * array means nothing moved. `before` may be null (no previous run).
 */
export function movement(before, after) {
  if (!after?.results) return [];
  if (!before?.results) return ["no previous instrument run to compare against"];
  const prev = new Map(before.results.map((r) => [r.id, r]));
  const out = [];
  for (const r of after.results) {
    const p = prev.get(r.id);
    if (!p) { out.push(`${r.id}: new instrument`); continue; }
    if (p.ok !== r.ok) out.push(`${r.id}: ${p.ok ? "PASS" : "FAIL"} → ${r.ok ? "PASS" : "FAIL"}`);
    else if (p.defects !== r.defects && (p.defects != null || r.defects != null)) {
      out.push(`${r.id}: ${p.defects ?? "?"} → ${r.defects ?? "?"} defects`);
    }
  }
  for (const p of before.results) if (!after.results.some((r) => r.id === p.id)) out.push(`${p.id}: no longer run`);
  return out;
}
