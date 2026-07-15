// lib/db/types.js
// Entity typedefs for the Alpha Learning Brain (JSDoc — this project is
// plain JS; no TS toolchain added). The LIVE store is lib/db/index.js
// (items/profiles/boards/board_items/interactions/edges/popularity).
// Future tables are staged in supabase/schema-alpha.sql; these shapes are
// the contract both sides share.

/** @typedef {Object.<string, number>} TagWeights  weights over lib/brain/tags.js */

/** @typedef {{ id:string, brand:string, title:string, category?:string,
 *   colors?:string[], colorEvidence?:object, material?:string, silhouette?:string, fit?:string,
 *   price?:number, currency?:string, size?:object, img?:string,
 *   images?:string[], tags:TagWeights, src?:string, source?:string,
 *   availability?:"available"|"sold"|"unknown", condition?:string,
 *   era?:string, designer?:string, archiveRef?:string, resaleStatus?:string,
 *   embeddingId?:string|null, url?:string, addedAt?:number }} Product */

/** @typedef {{ long:TagWeights, session:TagWeights,
 *   _meta:{ recent?:object[], seen?:object, activity?:number[],
 *           follows?:string[], looksSeen?:object } }} UserProfile */

/** @typedef {{ userId:string, usualSize?:string, preferredUnit:"in"|"cm",
 *   chest?:number, waist?:number, hips?:number, inseam?:number,
 *   height?:number, updatedAt:number }} UserMeasurements */

/** @typedef {{ id:string, userId:string, name:string, items:Product[] }} MoodBoard */

/** @typedef {{ userId:string, type:string, payload:object, at:number, v:number }} UserEvent
 *  type ∈ lib/events EVENTS */

/** @typedef {{ id:string, ownerId:string, vector:number[]|null, space:"tag-v0"|"visual-v1"|"text-v1",
 *   provider:string|null, updatedAt:number }} Embedding
 *  ownerId = product id | user id | board id | image ref */

/** @typedef {{ imageRef:string, provider:string|null, colors:string[],
 *   palette:object[], mood:object[], textures:object[], silhouettes:object[],
 *   objects:object[], styleReferences:object[], aestheticTags:object[],
 *   fashionRelevance:number|null, confidence:number }} ImageAnalysis */

/** @typedef {{ id:string, userId:string, imageRef:string,
 *   pieces:{ category:string, colors:string[], silhouette?:string,
 *            material?:string, aestheticTags:object[], confidence:number,
 *            exactMatch:string|null, similarItems:string[] }[],
 *   overallConfidence:number, at:number }} FitAnalysis */

/** @typedef {{ id:string, name:string, tags:TagWeights, designers?:string[],
 *   sources?:string[], risingScore?:number }} Brand */

/** @typedef {{ userId:string, platform:string, status:"connected"|"revoked",
 *   scopes:string[], connectedAt:number }} ExternalAccount
 *  tokens live server-side only, never in this shape */

/** @typedef {{ id:string, centroid:number[], label?:string, size:number,
 *   updatedAt:number }} TasteCluster */

/** @typedef {{ uidA:string, uidB:string, similarity:number, updatedAt:number }} UserSimilarity */

/** @typedef {{ userId:string, artists:string[], genres:string[],
 *   tags:TagWeights, coverage:number, updatedAt:number }} MusicProfile */

/** @typedef {{ boardId:string, tags:TagWeights, items:number,
 *   clusters?:string[], updatedAt:number }} BoardProfile */

/** @typedef {{ userId:string, source:string, refId:string, score:number,
 *   reasons:string[], servedAt?:number }} FeedItem
 *  source ∈ lib/feed FEED_SOURCES */

export {}; // typedef-only module
