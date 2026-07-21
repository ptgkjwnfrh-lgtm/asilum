"use client";

// app/components/Notice.jsx — ONE notice surface (synergy phase 1). The app
// had grown nine ad-hoc notice/error treatments; this is the house primitive
// they collapse into. Tone drives color only; dismissal is opt-in and shows
// a real affordance (the old .autonote dismissed on click with none).
//
//   <Notice>saved</Notice>
//   <Notice tone="error">could not reach the server</Notice>
//   <Notice tone="error" onDismiss={() => setError("")}>…</Notice>

export default function Notice({ tone = "info", onDismiss = null, children, className = "" }) {
  if (children == null || children === "") return null;
  return (
    <div className={`notice notice-${tone}${className ? " " + className : ""}`} role={tone === "error" ? "alert" : "status"}>
      <span className="notice-body">{children}</span>
      {onDismiss && (
        <button type="button" className="notice-x" aria-label="dismiss" onClick={onDismiss}>×</button>
      )}
    </div>
  );
}
