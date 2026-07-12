// lib/ai/types.js
// Shared JSDoc typedefs for the AI foundation (this project is plain JS —
// these are the "TypeScript types" of the house style, enforced at runtime
// by lib/ai/validate.js rather than a compiler).

/** @typedef {{tag:string, tag_type:string, confidence:number}} TypedTag */

/** @typedef {{ aestheticTags:string[], moodTags:string[], colorTags:string[],
 *   silhouetteTags:string[], fabricTags:string[], designerReferences:string[],
 *   eraTags:string[], summary:string, confidenceScore:number }} MoodBoardAnalysisOutput */

/** @typedef {{ name:string, summary:string, productIds:string[],
 *   matchedTags:string[], colorLogic:string, silhouetteLogic:string,
 *   aestheticLogic:string, confidenceScore:number }} StylistOutfitOutput */

/** @typedef {{ outfits: StylistOutfitOutput[] }} StylistOutput */

/** @typedef {{ userId:string, dominantAesthetics:{tag:string,weight:number}[],
 *   preferredColors:object[], preferredSilhouettes:object[],
 *   preferredFabrics:object[], preferredEras:object[], preferredBrands:object[],
 *   preferredDesigners:object[], avoidedTags:object[], tasteSummary:string,
 *   confidenceScore:number, sources:object, lastRebuiltAt:number }} UserStyleProfile */

/** @typedef {{ userId:string, requestText?:string, occasion?:string, mood?:string,
 *   budgetMin?:number, budgetMax?:number, sizePreferences?:string[],
 *   colorPreferences?:string[], excludedTags?:string[],
 *   useMoodBoardBrain?:boolean }} StylistRequest */

export {};
