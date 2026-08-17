"use client";

// app/components/DesignConsole.jsx — the DESIGN CONSOLE.
// The owner's hand on the Fashion Intelligence OS: every text size, button
// dimension, layout measure, and motion speed exposed as an instrument
// slider. Lives in the shell so edits stay live across navigation.
//
// Open: Settings → Appearance, or ctrl+shift+D anywhere.
// INSPECT: click any element on the page and the console jumps to the
// controls that govern it. Everything persists per-device (localStorage
// asilum-uilab, applied pre-paint in app/layout.js); presets can be saved,
// exported, and imported as JSON.

import { useEffect, useRef, useState } from "react";
import {
  GROUPS, ALL_CONTROLS, UILAB_KEY,
  loadOverrides, saveOverrides, applyOverrides,
  formatValue, parseValue, validValue,
  loadPresets, savePresets, sanitizeImport,
} from "../../lib/uilab.js";
import { useEscape } from "./dismiss.js";

export default function DesignConsole() {
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [openGroups, setOpenGroups] = useState({ type: true });
  const [inspecting, setInspecting] = useState(false);
  const [flashKeys, setFlashKeys] = useState([]);
  const [presets, setPresets] = useState({});
  const [presetName, setPresetName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const rowRefs = useRef({});
  const hlRef = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    setOverrides(loadOverrides());
    setPresets(loadPresets());
    const onOpen = () => setOpen(true);
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("asilum:uilab-open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("asilum:uilab-open", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Escape: leave inspect mode first; a second press closes the console.
  useEscape(() => {
    if (inspecting) setInspecting(false);
    else setOpen(false);
  }, open);

  function commit(next) {
    setOverrides(next);
    saveOverrides(next);
    applyOverrides(next);
  }

  function setControl(control, rawNumber) {
    const value = formatValue(control, rawNumber);
    if (!validValue(value)) return;
    commit({ ...overrides, [control.key]: value });
  }

  function clearControl(control) {
    const next = { ...overrides };
    delete next[control.key];
    commit(next);
  }

  function toggleControl(control) {
    if (overrides[control.key] !== undefined) clearControl(control);
    else commit({ ...overrides, [control.key]: control.off });
  }

  function resetAll() {
    if (!resetArmed) { setResetArmed(true); return; }
    setResetArmed(false);
    commit({});
    setMessage("all hand edits cleared — shipped design restored");
  }

  // ---- Presets ----
  function savePreset() {
    const name = presetName.trim().slice(0, 40);
    if (!name) { setMessage("name the preset first"); return; }
    const next = { ...presets, [name]: { ...overrides } };
    setPresets(next);
    savePresets(next);
    setPresetName("");
    setMessage(`preset "${name}" saved on this device`);
  }
  function applyPreset(name) {
    commit({ ...presets[name] });
    setMessage(`preset "${name}" applied`);
  }
  function deletePreset(name) {
    const next = { ...presets };
    delete next[name];
    setPresets(next);
    savePresets(next);
  }
  async function exportPreset() {
    const payload = JSON.stringify({ asilum: "uilab-preset", overrides }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setMessage("preset JSON copied to clipboard");
    } catch {
      setImportOpen(true);
      setImportText(payload);
      setMessage("clipboard unavailable — JSON shown below, copy by hand");
    }
  }
  function importPreset() {
    const result = sanitizeImport(importText);
    if (!result.ok) { setMessage("import failed: " + result.error); return; }
    commit(result.overrides);
    setImportOpen(false);
    setImportText("");
    setMessage(result.dropped
      ? `imported — ${result.dropped} unknown value(s) dropped`
      : "preset imported");
  }

  // ---- INSPECT mode: click an element, land on its controls ----
  useEffect(() => {
    if (!inspecting) {
      document.documentElement.classList.remove("dc-inspecting");
      if (hlRef.current) hlRef.current.style.display = "none";
      return undefined;
    }
    document.documentElement.classList.add("dc-inspecting");

    const findControls = (start) => {
      for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
        if (el.closest && el.closest(".dc")) return { el: null, keys: [] };
        const keys = ALL_CONTROLS
          .filter((c) => c.selectors.some((sel) => { try { return el.matches(sel); } catch { return false; } }))
          .map((c) => c.key);
        if (keys.length) return { el, keys };
      }
      return { el: null, keys: [] };
    };

    const onMove = (event) => {
      const { el } = findControls(event.target);
      const hl = hlRef.current;
      if (!hl) return;
      if (!el) { hl.style.display = "none"; return; }
      const r = el.getBoundingClientRect();
      hl.style.display = "block";
      hl.style.left = r.left - 3 + "px";
      hl.style.top = r.top - 3 + "px";
      hl.style.width = r.width + 6 + "px";
      hl.style.height = r.height + 6 + "px";
      hl.firstChild.textContent = (el.className && String(el.className).split(" ")[0]) || el.tagName.toLowerCase();
    };

    const onClick = (event) => {
      if (event.target.closest && event.target.closest(".dc")) return;
      event.preventDefault();
      event.stopPropagation();
      const { keys } = findControls(event.target);
      setInspecting(false);
      if (!keys.length) { setMessage("no console control governs that element yet"); return; }
      const groups = {};
      for (const group of GROUPS) {
        if (group.controls.some((c) => keys.includes(c.key))) groups[group.id] = true;
      }
      setOpenGroups((g) => ({ ...g, ...groups }));
      setFlashKeys(keys);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashKeys([]), 1400);
      setTimeout(() => rowRefs.current[keys[0]]?.scrollIntoView({ block: "center" }), 60);
      setMessage("");
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.documentElement.classList.remove("dc-inspecting");
      if (hlRef.current) hlRef.current.style.display = "none";
    };
  }, [inspecting]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // Overrides changed in another tab: re-read and re-apply.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== UILAB_KEY) return;
      const fresh = loadOverrides();
      setOverrides(fresh);
      applyOverrides(fresh);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!open) return null;

  const editedCount = Object.keys(overrides).length;

  return (
    <>
      <div className="dchl" ref={hlRef} style={{ display: "none" }} aria-hidden="true"><em /></div>
      <aside className="dc" aria-label="design console">
        <div className="dchead">
          <b>*</b> DESIGN CONSOLE
          <button
            className={"dcinspect" + (inspecting ? " on" : "")}
            title="click any element on the page to find its controls"
            onClick={() => setInspecting((v) => !v)}
          >
            {inspecting ? "◉ CLICK A TARGET" : "◎ INSPECT"}
          </button>
          <button className="dcx" title="close (esc)" onClick={() => setOpen(false)}>×</button>
        </div>

        <div className="dcbody">
          {GROUPS.map((group) => {
            const isOpen = !!openGroups[group.id];
            const touched = group.controls.filter((c) => overrides[c.key] !== undefined).length;
            return (
              <section key={group.id} className={"dcgroup" + (isOpen ? " open" : "")}>
                <button
                  className="dcgrouphead"
                  onClick={() => setOpenGroups((g) => ({ ...g, [group.id]: !isOpen }))}
                >
                  {group.title}
                  {touched > 0 && <span className="dccount">{touched}</span>}
                  <i>{isOpen ? "▾" : "▸"}</i>
                </button>
                {isOpen && (
                  <div className="dcrows">
                    {group.controls.map((control) => (
                      <ControlRow
                        key={control.key}
                        control={control}
                        overrides={overrides}
                        flash={flashKeys.includes(control.key)}
                        rowRef={(el) => { rowRefs.current[control.key] = el; }}
                        onSet={setControl}
                        onClear={clearControl}
                        onToggle={toggleControl}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="dcfoot">
          <div className="dcstatus">
            {editedCount ? <><b>{editedCount}</b> HAND EDIT{editedCount === 1 ? "" : "S"} LIVE</> : "SHIPPED DESIGN — NO EDITS"}
          </div>
          <div className="dcfootrow">
            <input aria-label="preset name"
              type="text"
              placeholder="preset name…"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
            />
            <button className="fitbtn" onClick={savePreset}>SAVE</button>
          </div>
          {Object.keys(presets).map((name) => (
            <div className="dcpreset" key={name}>
              <b>{name}</b>
              <button className="fitbtn" onClick={() => applyPreset(name)}>APPLY</button>
              <button className="dcx" title="delete preset" onClick={() => deletePreset(name)}>×</button>
            </div>
          ))}
          <div className="dcfootrow">
            <button className="fitbtn" onClick={exportPreset}>EXPORT ↗</button>
            <button className="fitbtn" onClick={() => { setImportOpen((v) => !v); setMessage(""); }}>IMPORT</button>
            <button className="fitbtn" onClick={resetAll} onBlur={() => setResetArmed(false)}>
              {resetArmed ? "SURE? RESET ✓" : "RESET ALL"}
            </button>
          </div>
          {importOpen && (
            <>
              <textarea aria-label="paste preset JSON"
                rows={4}
                placeholder='paste preset JSON — {"overrides":{…}}'
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="dcfootrow">
                <button className="fitbtn" onClick={importPreset}>APPLY IMPORT ✓</button>
              </div>
            </>
          )}
          {message && <div className="dcmsg">{message}</div>}
        </div>
      </aside>
    </>
  );
}

function ControlRow({ control, overrides, flash, rowRef, onSet, onClear, onToggle }) {
  if (control.kind === "toggle") {
    const off = overrides[control.key] !== undefined;
    return (
      <div className={"dcrow" + (off ? " set" : "") + (flash ? " flash" : "")} ref={rowRef}>
        <label>{control.label}</label>
        <span />
        <button className="fitbtn" style={{ gridColumn: "3 / 5" }} onClick={() => onToggle(control)}>
          {off ? "OFF" : "ON"}
        </button>
        {control.note && <div className="dcnote">{control.note}</div>}
      </div>
    );
  }
  const set = overrides[control.key] !== undefined;
  const value = set ? parseValue(control, overrides[control.key]) : control.fallback;
  return (
    <div className={"dcrow" + (set ? " set" : "") + (flash ? " flash" : "")} ref={rowRef}>
      <label>{control.label}</label>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={control.label}
        onChange={(e) => onSet(control, Number(e.target.value))}
      />
      <span className="dcval">{set || !control.fluid ? formatValue(control, value) : "FLUID"}</span>
      <button className="dcundo" title="back to shipped value" onClick={() => onClear(control)}>⟲</button>
      {control.note && <div className="dcnote">{control.note}</div>}
    </div>
  );
}
