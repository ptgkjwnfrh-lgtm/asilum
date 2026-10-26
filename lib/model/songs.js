// lib/model/songs.js — THE MODEL'S SONGS (owner, 25 Oct 2026: "cool songs"
// for the model's reader). Labelled sample records, the way SAMPLE_POSTS and
// the places register's fixtures are: real titles and artists, so the SONG
// card can be seen, and NOTHING ELSE — no art (a sleeve is the label's), no
// link, no playback, no provider (lib/music/index.js: there is no music
// catalog and no connected streaming service). The card prints SAMPLE.
//
// Isomorphic: plain data.

export const SAMPLE_SONGS = Object.freeze([
  { id: "sample-s1", sample: true, title: "Live Forever", artist: "Oasis", year: 1994 },
  { id: "sample-s2", sample: true, title: "Boys in the Better Land", artist: "Fontaines D.C.", year: 2019 },
  { id: "sample-s3", sample: true, title: "D.A.N.C.E.", artist: "Justice", year: 2007 },
  { id: "sample-s4", sample: true, title: "Reptilia", artist: "The Strokes", year: 2003 },
  { id: "sample-s5", sample: true, title: "Crimewave", artist: "Crystal Castles", year: 2008 },
  { id: "sample-s6", sample: true, title: "Daft Punk Is Playing at My House", artist: "LCD Soundsystem", year: 2005 },
  { id: "sample-s7", sample: true, title: "Starburster", artist: "Fontaines D.C.", year: 2024 },
  { id: "sample-s8", sample: true, title: "Maps", artist: "Yeah Yeah Yeahs", year: 2003 },
  { id: "sample-s9", sample: true, title: "Genesis", artist: "Justice", year: 2007 },
  { id: "sample-s10", sample: true, title: "Slide Away", artist: "Oasis", year: 1994 },
]);
