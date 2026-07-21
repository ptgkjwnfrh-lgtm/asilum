"use client";

// app/components/Notice.jsx — ONE notice surface (synergy phase 1). The app
// had grown nine ad-hoc notice/error treatments; this is the house primitive
// they collapse into.
//
// tone:    info | error       (color only)
// variant: inline | banner    (inline = compact panel hint; banner = the
//                              editorial red-left-border box, the old .autonote)
// onDismiss: opt-in; renders a real × affordance (the old .autonote dismissed
//            on click of the whole box, with no visible control).
//
//   <Notice>saved</Notice>
//   <Notice variant="banner" onDismiss={() => setNotice("")}>{notice}</Notice>
//   <Notice tone="error">could not reach the server</Notice>

export default function Notice({
  tone = "info", variant = "inline", onDismiss = null, children, className = "",
}) {
  if (children == null || children === "") return null;
  return (
    <div
      className={`notice notice-${tone} notice-${variant}${className ? " " + className : ""}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="notice-body">{children}</span>
      {onDismiss && (
        <button type="button" className="notice-x" aria-label="dismiss" onClick={onDismiss}>×</button>
      )}
    </div>
  );
}
