// scripts/generate-code-map.mjs — regenerate docs/CODE-MAP.md from the tree.
//
// WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN DOCUMENT. docs/ARCHITECTURE-MAP.md
// was written by hand and then sat claiming "schema v12" for five weeks while
// production ran v48. A map nobody can cheaply regenerate is a map that will
// drift, and a drifted map is worse than none — the first person to trust it is
// wrong about the whole layer it describes.
//
// So the inventory here is DERIVED: every file's one-line description is that
// file's own header comment, quoted. If a description is wrong, the fix is in
// the source file, which is where the next reader will look anyway.
//
// The prose sections (orientation, "where to start") are hand-written and live
// in docs/code-map-preamble.md, because judgement about what matters cannot be
// derived from a tree. Everything below the preamble is generated.
//
//   npm run docs:codemap
//
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const PREAMBLE = join(ROOT, "docs/code-map-preamble.md");
const OUT = join(ROOT, "docs/CODE-MAP.md");
const BIG_FILE = 1200; // the line count past which a file gets a ⚠️ and a debt entry

/** Every source file under a directory, sorted, excluding build output. */
function sourceFiles(dir) {
  if (!existsSync(join(ROOT, dir))) return [];
  return execSync(
    `find ${dir} -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.mjs' \\) -not -path '*/node_modules/*' | sort`,
    { cwd: ROOT, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
}

/**
 * A file's own description: the first substantive run of header comment lines.
 * Skips a bare `// path/to/file.js` line and the "use client" directive, both
 * of which are conventions here and neither of which describes anything.
 */
function describe(file) {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const base = file.split("/").pop();
  const parts = [];
  for (let i = 0; i < Math.min(16, lines.length); i++) {
    const t = lines[i].trim();
    if (/^["']use (client|server)["'];?$/.test(t)) continue;
    if (!/^(\/\/|\*|\/\*)/.test(t)) { if (parts.length) break; else continue; }
    let c = t.replace(/^\/\*+|^\/\/+|^\*+\/?/g, "").trim();
    if (!c) { if (parts.length) break; else continue; }
    if (c === file || c === base || c.startsWith(`${file} `) || c.startsWith(`${base} `)) {
      c = c.replace(file, "").replace(base, "").replace(/^[\s—–-]+/, "").trim();
      if (!c) continue;
    }
    parts.push(c);
    if (parts.join(" ").length > 90) break;
  }
  return parts.join(" ").slice(0, 160);
}

const stat = (file) => ({
  path: file,
  lines: readFileSync(join(ROOT, file), "utf8").split("\n").length,
  desc: describe(file),
});

/**
 * Group files by the directory they actually sit in.
 *
 * Grouping by a fixed path DEPTH looked simpler and was wrong: at depth 2 a
 * top-level module like `lib/accounts.js` became a heading called
 * "lib/accounts.js/", inventing a directory that does not exist. The real
 * grouping key is the dirname, which is right for `lib/`, `lib/ai/` and
 * `app/api/account/age/` alike without a special case for any of them.
 */
function groupBy(files) {
  const g = new Map();
  for (const f of files) {
    const key = f.path.split("/").slice(0, -1).join("/");
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(f);
  }
  return g;
}

const escape = (s) => s.replace(/\|/g, "\\|");

function renderSection(title, blurb, groups) {
  const out = [`\n---\n\n## ${title}\n`, blurb, ""];
  for (const [dir, files] of [...groups.entries()].sort()) {
    const total = files.reduce((s, f) => s + f.lines, 0);
    out.push(`\n### \`${dir}/\``);
    out.push(`*${files.length} file${files.length > 1 ? "s" : ""}, ${total.toLocaleString()} lines*\n`);
    out.push("| File | Lines | What it is |");
    out.push("| --- | ---: | --- |");
    for (const f of [...files].sort((a, b) => b.lines - a.lines)) {
      const warn = f.lines > BIG_FILE ? " ⚠️" : "";
      const desc = escape(f.desc) || "_no header — tracked in docs/DEBT-REGISTER.md_";
      out.push(`| \`${f.path.split("/").pop()}\` | ${f.lines}${warn} | ${desc} |`);
    }
  }
  return out.join("\n");
}

const libFiles = sourceFiles("lib").map(stat);
const appFiles = sourceFiles("app").map(stat);
const scriptFiles = sourceFiles("scripts").map(stat);
const api = appFiles.filter((f) => f.path.startsWith("app/api/"));
const surface = appFiles.filter((f) => !f.path.startsWith("app/api/"));

const generated = [
  renderSection("`lib/` — the engine",
    "All the thinking. Pure modules: no HTTP, no React, unit-testable in isolation.\n"
    + "Nothing here may import from `app/`.",
    groupBy(libFiles)),
  renderSection("`app/api/` — the request plane",
    "Every HTTP entry point. Authentication, rate limiting and input validation\n"
    + "belong HERE and not deeper — a route is the boundary where an untrusted\n"
    + "request becomes trusted arguments.",
    groupBy(api)),
  renderSection("`app/` — the surface",
    "Pages and components. Server components by default; `\"use client\"` marks the\n"
    + "interactive ones. UI is governed by `CONSTITUTION.md` — read it before redesigning.",
    groupBy(surface)),
  renderSection("`scripts/` — operational and measurement tooling",
    "Nothing here runs in production. `measure-*` are the evaluation harnesses that\n"
    + "keep the engine honest; the rest are migration and maintenance commands.",
    groupBy(scriptFiles)),
].join("\n");

const preamble = existsSync(PREAMBLE)
  ? readFileSync(PREAMBLE, "utf8").trimEnd()
  : "# CODE MAP\n\n_(docs/code-map-preamble.md is missing — only the generated inventory follows.)_";

const stamp = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const totals = [...libFiles, ...appFiles, ...scriptFiles];
const footer = `\n---\n\n*Generated by \`npm run docs:codemap\` from main @ ${stamp} — `
  + `${totals.length} source files, ${totals.reduce((s, f) => s + f.lines, 0).toLocaleString()} lines. `
  + `Do not edit this file by hand; edit \`docs/code-map-preamble.md\` or the source headers.*\n`;

writeFileSync(OUT, `${preamble}\n${generated}\n${footer}`);
console.log(`docs/CODE-MAP.md regenerated — ${totals.length} files indexed @ ${stamp}`);
