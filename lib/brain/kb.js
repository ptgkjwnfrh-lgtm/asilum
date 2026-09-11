// ASiLUM brain — KNOWLEDGE BASE: the 'zenith of fashion knowledge' layer.
// Maps designers, genres/aesthetics, eras — and (asterisk-boost r1) style
// icons, musicians, films, and cities — to canonical tag vectors so the
// brain can deduce what a product IS from a brand name, and what a bearer
// LIKES from the culture they name on /upload. Deterministic curated
// editorial judgement; no generative anything.
import { TAGS } from './tags.js';

import { houseKbEntries } from '../asterisk/houses.js';

// Designers -> dominant aesthetic tags.
//
// DERIVED FROM THE HOUSE REGISTER (knowledge round, 11 Sep 2026). This table
// used to be a second hand-kept list of houses beside lib/asterisk/houses.js,
// and the two had drifted — MEASURED before the round: 83 keys here had no
// origin row there, 20 rows there had no key here, and 12 of the catalog's
// own 64 brands read as an EMPTY taste vector. The register now carries the
// aesthetics a house is known for, and every designer key here — the brand
// name, its trade short forms, its brain-only spellings (`aka`) — comes
// from it. Add a house THERE, never here.
//
// The only designer keys that are not houses are PEOPLE — a designer whose
// work is split across houses and whom a bearer names on /upload — declared
// as such so tests/house-register.test.js can tell the two apart.
export const KB_PEOPLE = {
  'virgil abloh':    ['STREETWEAR', 'STATEMENT', 'AVANT-GARDE'],
  'hedi slimane':    ['SEDUCTIVE', 'MINIMAL', 'ARCHIVAL'],
  'phoebe philo':    ['MINIMAL', 'TAILORED', 'AVANT-GARDE'],
  'grace wales bonner': ['TAILORED', 'ARCHIVAL', 'INDEPENDENT'],
};
// Trade words that are neither a house nor a person.
const KB_TRADE = {
  'grailz':          ['ARCHIVAL', 'AVANT-GARDE', 'STREETWEAR'],
};
const KB_DESIGNERS = { ...houseKbEntries(), ...KB_PEOPLE, ...KB_TRADE };

// Genres / aesthetics / micro-trends -> tags.
const KB_GENRES = {
  'techwear':   ['UTILITARIAN', 'STREETWEAR', 'AVANT-GARDE'],
  'gorpcore':   ['GORP', 'UTILITARIAN'],
  'opiumcore':  ['AVANT-GARDE', 'STATEMENT', 'STREETWEAR'],
  'mob wife':   ['SEDUCTIVE', 'STATEMENT'],
  'quiet luxury': ['MINIMAL', 'TAILORED'],
  'old money':  ['TAILORED', 'MINIMAL'],
  'archival':   ['ARCHIVAL', 'AVANT-GARDE'],
  'workwear':   ['UTILITARIAN', 'STREETWEAR'],
  'grunge':     ['INDEPENDENT', 'STREETWEAR', 'ARCHIVAL'],
  'y2k':        ['STATEMENT', 'STREETWEAR'],
  'minimalism': ['MINIMAL', 'TAILORED'],
  'avant garde': ['AVANT-GARDE', 'STATEMENT'],
  'streetwear': ['STREETWEAR', 'STATEMENT'],
  'americana':  ['UTILITARIAN', 'ARCHIVAL'],
  'gorp':       ['GORP', 'UTILITARIAN'],
  'normcore':   ['MINIMAL', 'UTILITARIAN'],
  'blokecore':  ['STREETWEAR', 'ARCHIVAL'],
  'balletcore': ['SEDUCTIVE', 'MINIMAL'],
  'cottagecore': ['INDEPENDENT', 'ARCHIVAL', 'SEDUCTIVE'],
  'fairycore':  ['SEDUCTIVE', 'INDEPENDENT', 'AVANT-GARDE'],
  'darkwear':   ['AVANT-GARDE', 'UTILITARIAN', 'MINIMAL'],
  'ninja':      ['AVANT-GARDE', 'UTILITARIAN', 'STREETWEAR'],
  'skate':      ['STREETWEAR', 'INDEPENDENT'],
  'skater':     ['STREETWEAR', 'INDEPENDENT'],
  'surf':       ['STREETWEAR', 'INDEPENDENT', 'GORP'],
  'prep':       ['TAILORED', 'ARCHIVAL', 'MINIMAL'],
  'dark academia': ['TAILORED', 'ARCHIVAL', 'INDEPENDENT'],
  'light academia': ['TAILORED', 'MINIMAL', 'ARCHIVAL'],
  'city boy':   ['STREETWEAR', 'MINIMAL', 'UTILITARIAN'],
  'japanese denim': ['ARCHIVAL', 'INDEPENDENT', 'UTILITARIAN'],
  'heritage':   ['ARCHIVAL', 'UTILITARIAN', 'TAILORED'],
  'military surplus': ['UTILITARIAN', 'ARCHIVAL'],
  'clubwear':   ['SEDUCTIVE', 'STATEMENT', 'STREETWEAR'],
  'coquette':   ['SEDUCTIVE', 'STATEMENT'],
  'gothcore':   ['AVANT-GARDE', 'SEDUCTIVE', 'INDEPENDENT'],
  'cyberpunk':  ['AVANT-GARDE', 'UTILITARIAN', 'STATEMENT'],
  'solarpunk':  ['GORP', 'INDEPENDENT', 'MINIMAL'],
  'scandi':     ['MINIMAL', 'TAILORED', 'INDEPENDENT'],
  'parisian':   ['TAILORED', 'MINIMAL', 'SEDUCTIVE'],
  'tomboy':     ['STREETWEAR', 'MINIMAL', 'UTILITARIAN'],
  'androgynous': ['AVANT-GARDE', 'MINIMAL', 'TAILORED'],
  // asterisk-boost r2: measured misses from the theoretical batteries
  'acubi':      ['MINIMAL', 'AVANT-GARDE', 'STREETWEAR'],
  'warcore':    ['UTILITARIAN', 'AVANT-GARDE', 'STATEMENT'],
  'corpcore':   ['TAILORED', 'MINIMAL', 'UTILITARIAN'],
  'twee':       ['INDEPENDENT', 'ARCHIVAL', 'SEDUCTIVE'],
  'indie sleaze': ['INDEPENDENT', 'STATEMENT', 'STREETWEAR'],
  'downtown girl': ['INDEPENDENT', 'STREETWEAR', 'SEDUCTIVE'],
  'skinhead':   ['UTILITARIAN', 'ARCHIVAL', 'STREETWEAR'],
  'rockabilly': ['ARCHIVAL', 'STATEMENT', 'INDEPENDENT'],
  'vaporwave':  ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'weirdcore':  ['AVANT-GARDE', 'INDEPENDENT', 'STATEMENT'],
  'streetgoth': ['STREETWEAR', 'AVANT-GARDE', 'MINIMAL'],
  'health goth': ['STREETWEAR', 'MINIMAL', 'UTILITARIAN'],
  'lunarcore':  ['AVANT-GARDE', 'UTILITARIAN', 'MINIMAL'],
  'cyber y2k':  ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'eclectic grandpa': ['ARCHIVAL', 'INDEPENDENT', 'TAILORED'],
  'coastal grandmother': ['MINIMAL', 'TAILORED'],
  'tenniscore': ['TAILORED', 'MINIMAL', 'STREETWEAR'],
  'moto girl':  ['SEDUCTIVE', 'STATEMENT', 'STREETWEAR'],
  'brat':       ['STATEMENT', 'STREETWEAR', 'SEDUCTIVE'],
};

// Eras -> tags.
const KB_ERAS = {
  '1960s': ['TAILORED', 'MINIMAL', 'STATEMENT'],
  '1970s': ['SEDUCTIVE', 'INDEPENDENT'],
  '1980s': ['STATEMENT', 'SEDUCTIVE'],
  '1990s': ['MINIMAL', 'ARCHIVAL', 'INDEPENDENT'],
  'y2k era': ['STATEMENT', 'STREETWEAR'],
  '2000s era': ['STATEMENT', 'STREETWEAR'],
  '2010s': ['STREETWEAR', 'STATEMENT'],
  '2020s': ['GORP', 'MINIMAL', 'STREETWEAR'],
};

// Style icons — the people bearers name on /upload. Read as the aesthetic
// their public dressing is known FOR, not private taste claims.
const KB_ICONS = {
  'rihanna':          ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'asap rocky':       ['STREETWEAR', 'ARCHIVAL', 'AVANT-GARDE'],
  'a$ap rocky':       ['STREETWEAR', 'ARCHIVAL', 'AVANT-GARDE'],
  'kanye west':       ['MINIMAL', 'STREETWEAR', 'AVANT-GARDE'],
  'ye':               ['MINIMAL', 'STREETWEAR', 'AVANT-GARDE'],
  'zendaya':          ['STATEMENT', 'TAILORED', 'AVANT-GARDE'],
  'timothee chalamet': ['AVANT-GARDE', 'TAILORED', 'INDEPENDENT'],
  'bella hadid':      ['ARCHIVAL', 'SEDUCTIVE', 'STREETWEAR'],
  'kendall jenner':   ['MINIMAL', 'SEDUCTIVE', 'TAILORED'],
  'hailey bieber':    ['MINIMAL', 'STREETWEAR', 'SEDUCTIVE'],
  'kim kardashian':   ['SEDUCTIVE', 'MINIMAL', 'STATEMENT'],
  'jennie':           ['SEDUCTIVE', 'STATEMENT', 'STREETWEAR'],
  'lisa':             ['STATEMENT', 'STREETWEAR', 'SEDUCTIVE'],
  'g-dragon':         ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  'jaden smith':      ['AVANT-GARDE', 'STREETWEAR', 'INDEPENDENT'],
  'tyler the creator': ['STATEMENT', 'TAILORED', 'INDEPENDENT'],
  'frank ocean':      ['MINIMAL', 'INDEPENDENT', 'ARCHIVAL'],
  'pharrell':         ['STREETWEAR', 'STATEMENT', 'INDEPENDENT'],
  'david bowie':      ['AVANT-GARDE', 'STATEMENT', 'SEDUCTIVE'],
  'prince':           ['SEDUCTIVE', 'STATEMENT', 'AVANT-GARDE'],
  'grace jones':      ['AVANT-GARDE', 'STATEMENT', 'SEDUCTIVE'],
  'kate moss':        ['MINIMAL', 'SEDUCTIVE', 'INDEPENDENT'],
  'naomi campbell':   ['SEDUCTIVE', 'STATEMENT', 'TAILORED'],
  'audrey hepburn':   ['TAILORED', 'MINIMAL', 'SEDUCTIVE'],
  'james dean':       ['ARCHIVAL', 'INDEPENDENT', 'UTILITARIAN'],
  'steve mcqueen':    ['ARCHIVAL', 'UTILITARIAN', 'TAILORED'],
  'jane birkin':      ['MINIMAL', 'INDEPENDENT', 'SEDUCTIVE'],
  'diana':            ['TAILORED', 'STATEMENT', 'MINIMAL'],
  'princess diana':   ['TAILORED', 'STATEMENT', 'MINIMAL'],
  'carolyn bessette': ['MINIMAL', 'TAILORED'],
  'aaliyah':          ['STREETWEAR', 'SEDUCTIVE', 'STATEMENT'],
  'kurt cobain':      ['INDEPENDENT', 'ARCHIVAL', 'STREETWEAR'],
  'chloe sevigny':    ['INDEPENDENT', 'AVANT-GARDE', 'ARCHIVAL'],
  'alexa chung':      ['INDEPENDENT', 'TAILORED', 'MINIMAL'],
  'harry styles':     ['STATEMENT', 'SEDUCTIVE', 'INDEPENDENT'],
  'bad bunny':        ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'billie eilish':    ['STREETWEAR', 'STATEMENT', 'INDEPENDENT'],
  'rosalia':          ['STATEMENT', 'SEDUCTIVE', 'AVANT-GARDE'],
  'dua lipa':         ['SEDUCTIVE', 'STATEMENT', 'STREETWEAR'],
  'travis scott':     ['STREETWEAR', 'ARCHIVAL', 'UTILITARIAN'],
  'playboi carti':    ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  'chief keef':       ['STREETWEAR', 'STATEMENT', 'ARCHIVAL'],
  'lil uzi vert':     ['STREETWEAR', 'STATEMENT', 'AVANT-GARDE'],
  'young thug':       ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  // asterisk-boost r2: measured misses
  'dennis rodman':    ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'andre 3000':       ['STATEMENT', 'INDEPENDENT', 'ARCHIVAL'],
  'erykah badu':      ['INDEPENDENT', 'AVANT-GARDE', 'STATEMENT'],
  'solange':          ['AVANT-GARDE', 'MINIMAL', 'INDEPENDENT'],
  'mary kate olsen':  ['MINIMAL', 'AVANT-GARDE', 'INDEPENDENT'],
  'ashley olsen':     ['MINIMAL', 'AVANT-GARDE', 'TAILORED'],
  'victoria beckham': ['TAILORED', 'MINIMAL', 'SEDUCTIVE'],
  'yung lean':        ['STREETWEAR', 'INDEPENDENT', 'AVANT-GARDE'],
  'bladee':           ['AVANT-GARDE', 'STREETWEAR', 'INDEPENDENT'],
  'ecco2k':           ['AVANT-GARDE', 'MINIMAL', 'INDEPENDENT'],
  'ian connor':       ['STREETWEAR', 'ARCHIVAL', 'INDEPENDENT'],
  'luka sabbat':      ['STREETWEAR', 'AVANT-GARDE', 'INDEPENDENT'],
  'wisdom kaye':      ['STATEMENT', 'TAILORED', 'AVANT-GARDE'],
  'emma chamberlain': ['INDEPENDENT', 'STREETWEAR', 'MINIMAL'],
  'devon lee carlson': ['INDEPENDENT', 'ARCHIVAL', 'STREETWEAR'],
  'matilda djerf':    ['MINIMAL', 'TAILORED', 'SEDUCTIVE'],
  'jacob elordi':     ['TAILORED', 'MINIMAL', 'ARCHIVAL'],
  'paul mescal':      ['MINIMAL', 'INDEPENDENT', 'TAILORED'],
  'lakeith stanfield': ['AVANT-GARDE', 'TAILORED', 'INDEPENDENT'],
  'tracee ellis ross': ['STATEMENT', 'TAILORED', 'SEDUCTIVE'],
  'iris apfel':       ['STATEMENT', 'INDEPENDENT', 'ARCHIVAL'],
};

// Musicians AS sound worlds (the sound you dress like) — coarser than
// icons: what the LISTENERSHIP dresses like, mapped through the genre.
const KB_MUSICIANS = {
  'sza':             ['STREETWEAR', 'SEDUCTIVE', 'INDEPENDENT'],
  'drake':           ['STREETWEAR', 'TAILORED', 'STATEMENT'],
  'beyonce':         ['STATEMENT', 'SEDUCTIVE', 'TAILORED'],
  'lana del rey':    ['SEDUCTIVE', 'ARCHIVAL', 'INDEPENDENT'],
  'taylor swift':    ['SEDUCTIVE', 'MINIMAL', 'STATEMENT'],
  'the weeknd':      ['SEDUCTIVE', 'STREETWEAR', 'MINIMAL'],
  'radiohead':       ['INDEPENDENT', 'MINIMAL', 'AVANT-GARDE'],
  'aphex twin':      ['AVANT-GARDE', 'UTILITARIAN', 'INDEPENDENT'],
  'bjork':           ['AVANT-GARDE', 'STATEMENT', 'INDEPENDENT'],
  'sade':            ['MINIMAL', 'SEDUCTIVE', 'TAILORED'],
  'miles davis':     ['TAILORED', 'ARCHIVAL', 'MINIMAL'],
  'nirvana':         ['INDEPENDENT', 'ARCHIVAL', 'STREETWEAR'],
  'the cure':        ['AVANT-GARDE', 'SEDUCTIVE', 'INDEPENDENT'],
  'joy division':    ['MINIMAL', 'INDEPENDENT', 'AVANT-GARDE'],
  'deftones':        ['INDEPENDENT', 'STREETWEAR', 'AVANT-GARDE'],
  'kendrick lamar':  ['STREETWEAR', 'INDEPENDENT', 'STATEMENT'],
  'future':          ['STREETWEAR', 'STATEMENT', 'SEDUCTIVE'],
  '21 savage':       ['STREETWEAR', 'STATEMENT'],
  'yeat':            ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  'ken carson':      ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  'destroy lonely':  ['AVANT-GARDE', 'STREETWEAR', 'STATEMENT'],
  'charli xcx':      ['STATEMENT', 'SEDUCTIVE', 'AVANT-GARDE'],
  'fka twigs':       ['AVANT-GARDE', 'SEDUCTIVE', 'INDEPENDENT'],
  'rosalía':         ['STATEMENT', 'SEDUCTIVE', 'AVANT-GARDE'],
  'burial':          ['UTILITARIAN', 'MINIMAL', 'INDEPENDENT'],
  'new order':       ['MINIMAL', 'STREETWEAR', 'INDEPENDENT'],
  'fleetwood mac':   ['INDEPENDENT', 'SEDUCTIVE', 'ARCHIVAL'],
  'bob dylan':       ['INDEPENDENT', 'ARCHIVAL', 'UTILITARIAN'],
};

// Films / shows as dressed worlds — the costume language a bearer means
// when they say a film looks like their closet.
const KB_FILMS = {
  'the matrix':       ['AVANT-GARDE', 'MINIMAL', 'UTILITARIAN'],
  'blade runner':     ['AVANT-GARDE', 'UTILITARIAN', 'ARCHIVAL'],
  'akira':            ['STREETWEAR', 'AVANT-GARDE', 'UTILITARIAN'],
  'ghost in the shell': ['AVANT-GARDE', 'UTILITARIAN', 'MINIMAL'],
  'american psycho':  ['TAILORED', 'MINIMAL', 'SEDUCTIVE'],
  'the talented mr ripley': ['TAILORED', 'ARCHIVAL', 'MINIMAL'],
  'call me by your name': ['TAILORED', 'MINIMAL', 'INDEPENDENT'],
  'in the mood for love': ['SEDUCTIVE', 'TAILORED', 'ARCHIVAL'],
  'chungking express': ['INDEPENDENT', 'STREETWEAR', 'MINIMAL'],
  'fallen angels':    ['INDEPENDENT', 'AVANT-GARDE', 'STREETWEAR'],
  'lost in translation': ['MINIMAL', 'INDEPENDENT', 'TAILORED'],
  'the virgin suicides': ['SEDUCTIVE', 'INDEPENDENT', 'ARCHIVAL'],
  'marie antoinette': ['SEDUCTIVE', 'STATEMENT', 'ARCHIVAL'],
  'clueless':         ['STATEMENT', 'SEDUCTIVE', 'TAILORED'],
  'mean girls':       ['STATEMENT', 'SEDUCTIVE'],
  'euphoria':         ['STATEMENT', 'SEDUCTIVE', 'STREETWEAR'],
  'skins':            ['INDEPENDENT', 'STREETWEAR', 'STATEMENT'],
  'trainspotting':    ['INDEPENDENT', 'STREETWEAR', 'ARCHIVAL'],
  'la haine':         ['STREETWEAR', 'UTILITARIAN', 'ARCHIVAL'],
  'kids':             ['STREETWEAR', 'INDEPENDENT', 'ARCHIVAL'],
  'do the right thing': ['STREETWEAR', 'STATEMENT', 'ARCHIVAL'],
  'paris texas':      ['ARCHIVAL', 'INDEPENDENT', 'UTILITARIAN'],
  'drive':            ['MINIMAL', 'STATEMENT', 'UTILITARIAN'],
  'heat':             ['TAILORED', 'MINIMAL', 'UTILITARIAN'],
  'the godfather':    ['TAILORED', 'ARCHIVAL', 'STATEMENT'],
  'goodfellas':       ['TAILORED', 'SEDUCTIVE', 'STATEMENT'],
  'sopranos':         ['SEDUCTIVE', 'TAILORED', 'STATEMENT'],
  'the sopranos':     ['SEDUCTIVE', 'TAILORED', 'STATEMENT'],
  'succession':       ['MINIMAL', 'TAILORED'],
  'mad men':          ['TAILORED', 'ARCHIVAL', 'MINIMAL'],
  'twin peaks':       ['ARCHIVAL', 'INDEPENDENT', 'SEDUCTIVE'],
  'blade':            ['AVANT-GARDE', 'SEDUCTIVE', 'UTILITARIAN'],
  'dune':             ['AVANT-GARDE', 'UTILITARIAN', 'MINIMAL'],
  'star wars':        ['UTILITARIAN', 'AVANT-GARDE', 'MINIMAL'],
  'interstellar':     ['UTILITARIAN', 'GORP', 'MINIMAL'],
  'moonrise kingdom': ['ARCHIVAL', 'GORP', 'INDEPENDENT'],
  'the royal tenenbaums': ['ARCHIVAL', 'INDEPENDENT', 'TAILORED'],
  // asterisk-boost r2: measured misses
  'fight club':       ['INDEPENDENT', 'ARCHIVAL', 'STATEMENT'],
  'pulp fiction':     ['TAILORED', 'ARCHIVAL', 'INDEPENDENT'],
  'spirited away':    ['INDEPENDENT', 'ARCHIVAL', 'MINIMAL'],
  'nana':             ['INDEPENDENT', 'SEDUCTIVE', 'STATEMENT'],
  'fruits basket':    ['INDEPENDENT', 'MINIMAL', 'SEDUCTIVE'],
  'gummo':            ['INDEPENDENT', 'ARCHIVAL', 'STREETWEAR'],
  'buffalo 66':       ['INDEPENDENT', 'ARCHIVAL', 'MINIMAL'],
  'eyes wide shut':   ['SEDUCTIVE', 'TAILORED', 'STATEMENT'],
  'a single man':     ['TAILORED', 'MINIMAL', 'SEDUCTIVE'],
  'tinker tailor':    ['TAILORED', 'ARCHIVAL', 'MINIMAL'],
  'oceans eleven':    ['TAILORED', 'SEDUCTIVE', 'STATEMENT'],
  'john wick':        ['TAILORED', 'MINIMAL', 'UTILITARIAN'],
  'wednesday':        ['AVANT-GARDE', 'MINIMAL', 'INDEPENDENT'],
  'peaky blinders':   ['TAILORED', 'ARCHIVAL', 'UTILITARIAN'],
  'gossip girl':      ['TAILORED', 'STATEMENT', 'SEDUCTIVE'],
  'sex and the city': ['STATEMENT', 'SEDUCTIVE', 'TAILORED'],
  'the bear':         ['MINIMAL', 'UTILITARIAN', 'STREETWEAR'],
  'atlanta':          ['STREETWEAR', 'INDEPENDENT', 'MINIMAL'],
  'insecure':         ['STREETWEAR', 'SEDUCTIVE', 'INDEPENDENT'],
};

// Cities where a bearer "feels dressed right" — the street uniform read.
const KB_CITIES = {
  'berlin city':   ['UTILITARIAN', 'AVANT-GARDE', 'MINIMAL'],
  'tokyo city':    ['AVANT-GARDE', 'STREETWEAR', 'INDEPENDENT'],
  'paris city':    ['TAILORED', 'AVANT-GARDE', 'SEDUCTIVE'],
  'milan city':    ['TAILORED', 'SEDUCTIVE'],
  'london city':   ['INDEPENDENT', 'STATEMENT', 'TAILORED'],
  'new york city': ['STREETWEAR', 'TAILORED', 'MINIMAL'],
  'nyc':           ['STREETWEAR', 'TAILORED', 'MINIMAL'],
  'seoul city':    ['STREETWEAR', 'MINIMAL', 'STATEMENT'],
  'copenhagen city': ['MINIMAL', 'INDEPENDENT', 'STATEMENT'],
  'stockholm city': ['MINIMAL', 'TAILORED'],
  'antwerp city':  ['AVANT-GARDE', 'INDEPENDENT', 'ARCHIVAL'],
  'los angeles city': ['STREETWEAR', 'STATEMENT', 'SEDUCTIVE'],
  'miami city':    ['SEDUCTIVE', 'STATEMENT'],
  'mexico city':   ['INDEPENDENT', 'STREETWEAR', 'ARCHIVAL'],
  'lagos':         ['STATEMENT', 'STREETWEAR', 'INDEPENDENT'],
  'shanghai':      ['AVANT-GARDE', 'STREETWEAR', 'MINIMAL'],
  'hong kong':     ['STREETWEAR', 'UTILITARIAN', 'MINIMAL'],
  'moscow':        ['UTILITARIAN', 'STATEMENT', 'AVANT-GARDE'],
};

// ONE SPELLING FOR A KEY AND FOR A PROMPT (knowledge round, 11 Sep 2026).
// The prompt tokenizer (lib/brain/index.js promptVector) splits on every
// non-alphanumeric, so "a.p.c." arrives as "a p c", "a$ap rocky" as
// "a ap rocky", "number (n)ine" as "number n ine" — and every one of those
// keys was unreachable, because the table kept the punctuation the tokenizer
// strips. Diacritics were worse: "garçons" split at the ç. Keys are now
// stored in the tokenizer's own shape, and lookups fold the same way, so a
// key can never again be spelled in a form no prompt can produce.
const DIACRITIC_MAP = Object.assign(Object.create(null), {
  ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", þ: "th", ð: "d",
});
export function foldText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[øæœßłđþð]/g, (c) => DIACRITIC_MAP[c] || c);
}
/** A key or a phrase in the tokenizer's shape: folded, split, single-spaced. */
export function foldKey(s) {
  return foldText(s).split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}
function foldTable(table) {
  const out = Object.create(null);
  for (const [k, v] of Object.entries(table)) {
    const key = foldKey(k);
    if (key) out[key] = v;
  }
  return out;
}

// Unified lookup index: token -> tag list. Later spreads win on key
// collisions, so designers stay authoritative over looser tables.
const KB_ALL = {
  ...foldTable(KB_CITIES), ...foldTable(KB_FILMS), ...foldTable(KB_MUSICIANS), ...foldTable(KB_ICONS),
  ...foldTable(KB_ERAS), ...foldTable(KB_GENRES), ...foldTable(KB_DESIGNERS),
};

// Full key list for the typo bridge (lib/brain/index.js fuzzy resolution).
export function kbKeys() {
  return Object.keys(KB_ALL);
}
/**
 * The tag vector a knowledge-base key stands for, or null.
 *
 * See the note in the body before touching the lookup: this reads a table
 * keyed by SEARCH WORDS, so it must never answer for a name that only exists
 * on Object.prototype.
 */
export function kbTagsFor(key) {
  // A QUERY WORD IS NOT A PROPERTY NAME. MEASURED: searching the single word
  // "constructor" CRASHED the engine — this lookup walked the prototype chain,
  // returned Object.prototype.constructor, and tagsToVec then tried to iterate
  // a function. "toString", "valueOf" and "hasOwnProperty" reach the same
  // branch. An own-property check costs nothing and closes all of them.
  if (typeof key !== "string") return null;
  const k = foldKey(key);
  return k && Object.hasOwn(KB_ALL, k) ? KB_ALL[k] : null;
}

// Convert a tag list to a partial vector (each valid tag gets `weight`).
export function tagsToVec(tagList, weight = 1) {
  const v = {};
  // Defensive: a non-array reaching here used to throw rather than degrade.
  if (!Array.isArray(tagList)) return v;
  for (const t of tagList) if (TAGS.includes(t)) v[t] = weight;
  return v;
}

// Exact KB hit only — the curated key or nothing. Callers that own a
// competing curated vocabulary (the LEXICON) must consult this FIRST, then
// their own table, and only then fall through to the fuzzy bridge below.
export function kbResolveExact(token) {
  const key = foldKey(token || '');
  if (!key) return null;
  const tags = kbTagsFor(key);
  return tags ? { key, tags } : null;
}

// Fuzzy substring bridge. Requires 4+ chars on both sides — short keys like
// 'ye', 'cdg', 'nyc' resolve exactly only, or every word containing them
// would inherit their tags.
//
// WHAT WAS WRONG (audit, Aug 9): this pass is a LAST RESORT and was being
// run as a first resort. Because resolveToken() called the combined
// kbResolve() before lexiconVector(), any curated LEXICON word that happened
// to sit inside a KB key lost its own meaning to that key — measured across
// all 328 LEXICON entries, 33 were shadowed and every one was materially
// wrong: 15 got the wrong tags outright ("white" -> "off white", so the
// colour read STREETWEAR/STATEMENT/AVANT-GARDE instead of MINIMAL/TAILORED;
// "lace" -> "palace"; "tweed" -> "twee"; "shell" -> "ghost in the shell";
// "rock" -> "asap rocky"), and the other 18 kept the right tags but had
// every weight forced to 1.0 by tagsToVec, so "paris" outvoted a curated
// aesthetic term. Keep the two phases separately callable so callers can
// place the bridge after their own vocabulary.
// A SINGLE WORD MAY ONLY BRIDGE TO A SINGLE WORD (11 Sep 2026). MEASURED when
// the house register grew to the archive canon: the bare garment word "jeans"
// fuzzy-matched "samurai jeans" and took that house's aesthetics at 1.0, and
// "jean" reached it the same way — reviving in a new form exactly the defect
// the note above records. A substring match across a word boundary is not
// evidence about a one-word query: the words in a multi-word key are ordinary
// words, and the bigger the register grows the more of them there are. So a
// one-word token bridges only to a one-word key. Multi-word spellings are
// already covered better by the phrase reader and by each house's declared
// `aka` forms, which are exact.
const wordCount = (s) => s.split(' ').length;
export function kbResolveFuzzy(token) {
  const key = foldKey(token || '');
  if (key.length < 4) return null;
  const keyWords = wordCount(key);
  for (const k in KB_ALL) {
    if (k.length < 4) continue;
    if (keyWords === 1 && wordCount(k) > 1) continue;
    if (k.includes(key) || key.includes(k)) {
      return { key: k, tags: KB_ALL[k] };
    }
  }
  return null;
}

// Resolve a free-text token against the KB (exact then fuzzy contains).
// Unchanged behaviour, for callers with no competing vocabulary of their own
// (e.g. brand strings in lib/tagging/dense.js, where the fuzzy bridge is the
// point — brand text varies and has no LEXICON entry to shadow).
export function kbResolve(token) {
  return kbResolveExact(token) || kbResolveFuzzy(token);
}
