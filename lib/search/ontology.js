// lib/search/ontology.js — Fashionpedia-informed garment vocabulary (r13).
//
// The vendored fashionpedia-ontology.json (CC BY 4.0, see NOTICE) is the
// evidence base; THIS crosswalk is the curated law. Every entry below maps a
// single-word garment noun from the Fashionpedia category/nickname ontology
// into the CATALOG's category space — the same contract as GARMENT_CATEGORY,
// which spreads these in. Multi-word and modifier-shaped vocabulary is
// deliberately excluded; the ontology's attribute lists (silhouette,
// textile, pattern…) are vendored for a future dense-layer round, unused
// today.
//
// EXCLUDED, with reasons (the landmine list — do not re-add casually):
//   top      — tokenizer splits "high-top" into [high, top]; would penalize
//              actual high-tops on their own query (documented since r8).
//   tie      — "tie-dye", "tie-up", "bow tie" all tokenize to [tie, …]; an
//              accessories signal on a tie-dye tee query is wrong.
//   crop     — modifier, not a garment ("crop top" / "crop jacket" /
//              "crop pants" span three categories).
//   halter   — ambiguous in the ontology itself (halter top vs halter dress).
//   sheath / shift / skater / chemise / bodycon — dress-or-skirt modifiers.
//   stockings / bloomers / smock / peasant / tube — rare or modifier-shaped.
//   jumper   — UK jumper = sweater vs US jumper dress; unresolvable alone.
//   robe     — bathrobe ambiguity.
//   hood/collar/lapel/sleeve/pocket etc. — garment PARTS, not garments; a
//              "cargo (pocket)" must not make "cargo" mean accessories.

export const ONTOLOGY_GARMENT_NOUNS = {
  // upperbody
  sweatshirt: "tops", camisole: "tops", tunic: "tops", henley: "tops",
  undershirt: "tops", tank: "tops", rugby: "tops",
  // outer layers
  cape: "outerwear", windbreaker: "outerwear", raincoat: "outerwear",
  trench: "outerwear", shearling: "outerwear", duster: "outerwear",
  kimono: "outerwear", bolero: "outerwear", varsity: "outerwear",
  tuxedo: "tailoring",
  // lowerbody
  sweatpants: "bottoms", leggings: "bottoms", tights: "bottoms",
  culottes: "bottoms", culotte: "bottoms", capri: "bottoms",
  jodhpur: "bottoms", harem: "bottoms", bermuda: "bottoms",
  boardshorts: "bottoms", trunks: "bottoms", skort: "bottoms",
  kilt: "bottoms", sarong: "bottoms", tutu: "bottoms",
  // wholebody
  jumpsuit: "dresses", sundress: "dresses", kaftan: "dresses",
  // head / hands / feet / others
  glasses: "accessories", glove: "accessories", gloves: "accessories",
  watch: "accessories", sock: "accessories", socks: "accessories",
  wallet: "accessories", umbrella: "accessories", headband: "accessories",
};
