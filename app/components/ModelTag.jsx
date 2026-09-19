// app/components/ModelTag.jsx — the honest tag (V.2).
// MODEL: simulated in this build. SAMPLE: fixture content, credited.
// DEVICE: kept on this device only. CONNECTION REQUIRED: a real service
// that is not keyed or approved yet. One word, never a paragraph.

export default function ModelTag({ kind = "model", children }) {
  const word = children || ({ model: "MODEL", sample: "SAMPLE", device: "ON THIS DEVICE", connection: "CONNECTION REQUIRED", preview: "PREVIEW" }[kind] || "MODEL");
  return <span className={"modeltag" + (kind === "connection" ? " warn" : "")}>{word}</span>;
}
