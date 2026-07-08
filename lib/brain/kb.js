// ASiLUM brain — KNOWLEDGE BASE: the 'zenith of fashion knowledge' layer.
// Maps designers, genres/aesthetics, and eras to canonical tag vectors so the
// brain can deduce what a product IS from a brand name or a vibe word.
import { TAGS } from './tags.js';

// Designers -> dominant aesthetic tags.
const KB_DESIGNERS = {
  'rick owens':      ['AVANT-GARDE', 'STATEMENT', 'ARCHIVAL'],
  'maison margiela': ['AVANT-GARDE', 'ARCHIVAL', 'INDEPENDENT'],
  'raf simons':      ['ARCHIVAL', 'AVANT-GARDE', 'INDEPENDENT'],
  'helmut lang':     ['MINIMAL', 'ARCHIVAL', 'TAILORED'],
  'prada':           ['UTILITARIAN', 'MINIMAL', 'STATEMENT'],
  'miu miu':         ['STATEMENT', 'SEDUCTIVE', 'INDEPENDENT'],
  'saint laurent':   ['SEDUCTIVE', 'TAILORED', 'STATEMENT'],
  'tom ford':        ['SEDUCTIVE', 'TAILORED'],
  'the row':         ['MINIMAL', 'TAILORED'],
  'khaite':          ['MINIMAL', 'TAILORED', 'SEDUCTIVE'],
  'dries van noten': ['TAILORED', 'ARCHIVAL', 'STATEMENT'],
  'balenciaga':      ['STATEMENT', 'STREETWEAR', 'AVANT-GARDE'],
  'bottega veneta':  ['MINIMAL', 'STATEMENT', 'TAILORED'],
  'jil sander':      ['MINIMAL', 'TAILORED'],
  'comme des garcons': ['AVANT-GARDE', 'INDEPENDENT', 'ARCHIVAL'],
  'yohji yamamoto':  ['AVANT-GARDE', 'ARCHIVAL', 'MINIMAL'],
  'stone island':    ['UTILITARIAN', 'GORP', 'STREETWEAR'],
  'arcteryx':        ['GORP', 'UTILITARIAN'],
  'salomon':         ['GORP', 'STREETWEAR', 'UTILITARIAN'],
  'carhartt':        ['UTILITARIAN', 'STREETWEAR'],
  'stussy':          ['STREETWEAR', 'INDEPENDENT'],
  'supreme':         ['STREETWEAR', 'STATEMENT'],
  'kapital':         ['INDEPENDENT', 'ARCHIVAL', 'GORP'],
  'undercover':      ['AVANT-GARDE', 'STREETWEAR', 'INDEPENDENT'],
  'acne studios':    ['MINIMAL', 'INDEPENDENT', 'TAILORED'],
  'our legacy':      ['INDEPENDENT', 'MINIMAL', 'ARCHIVAL'],
  'lemaire':         ['MINIMAL', 'TAILORED', 'UTILITARIAN'],
  'gucci':           ['STATEMENT', 'SEDUCTIVE'],
  'versace':         ['SEDUCTIVE', 'STATEMENT'],
  'chrome hearts':   ['STATEMENT', 'STREETWEAR'],
};

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
};

// Eras -> tags.
const KB_ERAS = {
  '1980s': ['STATEMENT', 'SEDUCTIVE'],
  '1990s': ['MINIMAL', 'ARCHIVAL', 'GRUNGE'],
  'y2k era': ['STATEMENT', 'STREETWEAR'],
  '1970s': ['SEDUCTIVE', 'INDEPENDENT'],
  '2010s': ['STREETWEAR', 'STATEMENT'],
};

// Unified lookup index: token -> tag list.
const KB_ALL = { ...KB_ERAS, ...KB_GENRES, ...KB_DESIGNERS };

// Convert a tag list to a partial vector (each valid tag gets `weight`).
export function tagsToVec(tagList, weight = 1) {
  const v = {};
  for (const t of tagList || []) if (TAGS.includes(t)) v[t] = weight;
  return v;
}

// Resolve a free-text token against the KB (exact then fuzzy contains).
export function kbResolve(token) {
  const key = String(token || '').trim().toLowerCase();
  if (!key) return null;
  if (KB_ALL[key]) return { key, tags: KB_ALL[key] };
  for (const k in KB_ALL) {
    if (k.includes(key) || key.includes(k)) return { key: k, tags: KB_ALL[k] };
  }
  return null;
}
