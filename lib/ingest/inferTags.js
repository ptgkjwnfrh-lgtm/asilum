import { coldStart } from "../brain/index.js";

// One shared text-to-vector bridge for every ingestion path.
export function inferTags(text) {
  return coldStart(text || "").profile;
}
