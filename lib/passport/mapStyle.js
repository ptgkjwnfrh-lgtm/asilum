// lib/passport/mapStyle.js — THE STREETS IN APPLE'S HAND (owner, 3 Nov 2026: "can you use ai magic and make
// open streetmap look like apple maps", choosing vector tiles and a theme of our own). A MapLibre style over
// OpenFreeMap's OpenStreetMap vector tiles (tiles.openfreemap.org — free, no key, commercial use allowed; the
// OpenMapTiles layer schema) drawn as Apple's light standard map draws a city, and as the owner set Apple's in
// SwiftUI: flat (no 3D, no tilt), every point of interest off, light. Soft warm land; pale green parks and
// woods; soft blue water; buildings a shade off the land; white streets with a faint grey casing, the major
// roads wider and warmer, the motorways Apple's yellow; rail a dashed grey; names in grey with a white halo,
// the towns darker and bolder. The palette is the MAP'S (Apple's cartography), not the house's theme tokens —
// the house's marks (the dot, the black labels, the ticket) sit on top of it in their own tokens.
// Pure data; app/components/VectorMap.jsx draws it.

export const OPENFREEMAP = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export const APPLE_LIGHT = Object.freeze({
  land: "#f8f5ef", residential: "#f3efe8", industrial: "#efece6", park: "#d6ecc9", wood: "#c9e4b9", grass: "#dcefd0",
  sand: "#f3ead3", water: "#a9d2f2", waterline: "#9cc8ec", building: "#ebe7e0", buildingEdge: "#e0dbd2",
  minor: "#ffffff", minorCase: "#e4dfd6", major: "#ffffff", majorCase: "#dcd4c4", trunk: "#fff3cf", trunkCase: "#ead79f",
  motorway: "#fcd98a", motorwayCase: "#e5b85c", rail: "#cfcac1", path: "#e6e1d8", aeroway: "#e9e6f0",
  label: "#6b7079", labelHalo: "#ffffff", place: "#3c4048", water_label: "#4f82b5", road_label: "#7a7f88",
});

const P = APPLE_LIGHT;
const REG = ["Noto Sans Regular"], BOLD = ["Noto Sans Bold"];
const name = ["coalesce", ["get", "name:en"], ["get", "name"]];
const w = (stops) => ["interpolate", ["exponential", 1.6], ["zoom"], ...stops]; // a width that grows with the zoom
const cls = (...c) => ["match", ["get", "class"], c, true, false];

export function appleLightStyle() {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: "vector", url: OPENFREEMAP, attribution: ATTRIBUTION } },
    layers: [
      { id: "land", type: "background", paint: { "background-color": P.land } },
      { id: "landuse-residential", type: "fill", source: "omt", "source-layer": "landuse", filter: cls("residential", "suburb", "neighbourhood"), paint: { "fill-color": P.residential } },
      { id: "landuse-industrial", type: "fill", source: "omt", "source-layer": "landuse", filter: cls("industrial", "commercial", "retail", "railway"), paint: { "fill-color": P.industrial } },
      { id: "landcover-wood", type: "fill", source: "omt", "source-layer": "landcover", filter: cls("wood", "forest"), paint: { "fill-color": P.wood } },
      { id: "landcover-grass", type: "fill", source: "omt", "source-layer": "landcover", filter: cls("grass", "meadow", "farmland", "scrub"), paint: { "fill-color": P.grass, "fill-opacity": 0.7 } },
      { id: "landcover-sand", type: "fill", source: "omt", "source-layer": "landcover", filter: cls("sand", "beach"), paint: { "fill-color": P.sand } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": P.park } },
      { id: "landuse-green", type: "fill", source: "omt", "source-layer": "landuse", filter: cls("cemetery", "pitch", "playground", "stadium", "garden"), paint: { "fill-color": P.park, "fill-opacity": 0.8 } },
      { id: "aeroway", type: "fill", source: "omt", "source-layer": "aeroway", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": P.aeroway } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": P.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": P.waterline, "line-width": w([10, 0.6, 18, 6]) } },
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 14, paint: { "fill-color": P.building, "fill-outline-color": P.buildingEdge, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, 1] } },

      // the roads: casings under, fills over — Apple's white streets with a soft edge
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 15, filter: cls("path", "track"), paint: { "line-color": P.path, "line-width": w([15, 0.8, 18, 2]), "line-dasharray": [2, 1.5] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: cls("rail", "transit"), paint: { "line-color": P.rail, "line-width": w([10, 0.6, 18, 2.4]), "line-dasharray": [3, 2] } },
      { id: "minor-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: cls("minor", "service"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.minorCase, "line-width": w([12, 1.2, 18, 16]) } },
      { id: "major-case", type: "line", source: "omt", "source-layer": "transportation", filter: cls("primary", "secondary", "tertiary"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.majorCase, "line-width": w([8, 1, 18, 24]) } },
      { id: "trunk-case", type: "line", source: "omt", "source-layer": "transportation", filter: cls("trunk"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.trunkCase, "line-width": w([6, 1, 18, 28]) } },
      { id: "motorway-case", type: "line", source: "omt", "source-layer": "transportation", filter: cls("motorway"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.motorwayCase, "line-width": w([5, 1, 18, 30]) } },
      { id: "minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: cls("minor", "service"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.minor, "line-width": w([12, 0.6, 18, 13]) } },
      { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: cls("primary", "secondary", "tertiary"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.major, "line-width": w([8, 0.6, 18, 20]) } },
      { id: "trunk", type: "line", source: "omt", "source-layer": "transportation", filter: cls("trunk"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.trunk, "line-width": w([6, 0.6, 18, 24]) } },
      { id: "motorway", type: "line", source: "omt", "source-layer": "transportation", filter: cls("motorway"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": P.motorway, "line-width": w([5, 0.6, 18, 26]) } },

      // the names: streets along their line, water in blue, places in grey and the towns bolder — no POIs
      { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 13, filter: cls("primary", "secondary", "tertiary", "minor", "trunk"),
        layout: { "symbol-placement": "line", "text-field": name, "text-font": REG, "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 18, 14], "text-max-angle": 30 },
        paint: { "text-color": P.road_label, "text-halo-color": P.labelHalo, "text-halo-width": 1.6 } },
      { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name",
        layout: { "text-field": name, "text-font": REG, "text-size": 12, "text-letter-spacing": 0.1 },
        paint: { "text-color": P.water_label, "text-halo-color": P.water, "text-halo-width": 0.8 } },
      { id: "place-minor", type: "symbol", source: "omt", "source-layer": "place", filter: cls("suburb", "neighbourhood", "quarter", "hamlet", "village"),
        layout: { "text-field": name, "text-font": REG, "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 13], "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 8 },
        paint: { "text-color": P.label, "text-halo-color": P.labelHalo, "text-halo-width": 1.6 } },
      { id: "place-town", type: "symbol", source: "omt", "source-layer": "place", filter: cls("city", "town"),
        layout: { "text-field": name, "text-font": BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 12, 17] },
        paint: { "text-color": P.place, "text-halo-color": P.labelHalo, "text-halo-width": 1.8 } },
    ],
  };
}
