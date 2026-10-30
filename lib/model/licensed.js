// lib/model/licensed.js — the licensed motions this device has read (the
// Pexels rows of /api/motion), kept so the media popup can open one by id
// the way it opens a sample from SAMPLE_POSTS: a licensed post has no
// server id and no permalink, so the record the Feed drew from is the one
// the popup shows. CLIENT-SAFE, plain state.

let rows = [];

export function rememberLicensed(posts) {
  rows = Array.isArray(posts) ? posts.filter((p) => p && p.id && p.licensed) : [];
}

export function licensedById(id) {
  return rows.find((p) => p.id === id) || null;
}

export function licensedRows() { return rows; }
