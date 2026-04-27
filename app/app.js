/* RepTime Lookup — single-file vanilla JS app.
 *
 * Loads two JSON databases at startup, builds a unified watch index plus a
 * scored dealer list, exposes a tokenized scoring search, and renders
 * result cards with factory recommendations + top-3 trusted dealers.
 *
 * No dependencies, no build step. Runs by serving this folder over HTTP.
 */

"use strict";

// ============================================================================
// Configuration
// ============================================================================

const FORUM_WEIGHTS = { RWI: 3, REPGEEK: 2, RWG: 1 };
const FORUM_LABEL = { RWI: "RWI", REPGEEK: "RepGeek", RWG: "RWG" };

const TIER_RANK = { NWBIG: 2, "Super Rep": 1, null: 0, undefined: 0 };
const TIER_CLASS = { NWBIG: "nwbig", "Super Rep": "super" };

const DATA_PATHS = {
  guide: "who-makes-the-best-guide.json",
  reptime: "reptime-help.json",
  images: "images.json", // optional; missing file is fine
  dealerSearch: "dealer-search.json", // optional per-dealer search-URL templates
  dealerDeepLinks: "dealer-deep-links.json", // optional (watch,dealer) → exact URL overrides
  dealerCatalog: "dealer-catalog.json", // scraped dealer pricing/stock
  fxRates: "fx-rates.json", // currency conversion rates
};

const MAX_RESULTS = 8;
const MAX_DEALERS_DEFAULT = 3;

// ============================================================================
// State (populated after load)
// ============================================================================

const state = {
  watches: [],         // unified watch records
  watchById: new Map(),
  dealers: [],         // sorted by score desc, then name asc
  factoryInfo: new Map(), // factory code → { specialty, description }
  glossary: new Map(),    // term → { definition, category }
  brands: [],          // unique brand names with counts
  families: [],        // grouped { id, brand, family, variants, ... }
  familyById: new Map(),
  images: {},          // family id → image URL (local or remote)
  dealerSearch: {},    // dealer id → { template, qSource }
  dealerDeepLinks: {}, // watch id → { dealer id → exact URL }
  dealerCatalog: {},   // scraped catalog data { offers: { watch_id: { dealer_id: {...} } } }
  brandFilter: "all",  // current filter on browse grid
  filters: {
    sort: "relevance",
    inStock: false,
    minPrice: null,
    maxPrice: null
  },
  loaded: false,
};

// ============================================================================
// Bootstrap
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    showBanner(`Failed to load data: ${err.message}`, true);
  });
});

async function init() {
  const [guide, reptime, images, dealerSearch, dealerDeepLinks, dealerCatalog, fx] = await Promise.all([
    fetchJson(DATA_PATHS.guide),
    fetchJson(DATA_PATHS.reptime),
    fetchJsonOptional(DATA_PATHS.images),
    fetchJsonOptional(DATA_PATHS.dealerSearch),
    fetchJsonOptional(DATA_PATHS.dealerDeepLinks),
    fetchJsonOptional(DATA_PATHS.dealerCatalog),
    fetchJsonOptional(DATA_PATHS.fxRates),
  ]);

  state.watches = buildUnifiedWatches(guide, reptime);
  state.watches.forEach((w) => state.watchById.set(w.id, w));
  state.dealers = buildDealers(reptime);
  state.factoryInfo = buildFactoryInfo(reptime);
  state.glossary = buildGlossary(reptime);
  state.brands = buildBrandList(state.watches);
  state.families = buildFamilies(state.watches);
  state.families.forEach((f) => state.familyById.set(f.id, f));
  state.images = images || {};
  state.dealerSearch = dealerSearch || {};
  state.dealerDeepLinks = dealerDeepLinks || {};
  state.dealerCatalog = dealerCatalog || { offers: {} };
  state.fxRates = fx || {};
  state.loaded = true;

  renderStats();
  wireSearch();
  wireFilters();
  wireRouting();
  renderRoute();
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function fetchJsonOptional(path) {
  // Returns null on any failure (404, parse error, network) — used for
  // optional config files like images.json that may not exist yet.
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Data normalization
// ============================================================================

/**
 * Tokenize any string: lowercase, split on spaces / commas / slashes / dashes /
 * parentheses, drop empty, drop pure-punctuation. Keep short alphanumerics
 * (e.g. "5711") but drop standalone punctuation tokens.
 */
function tokenize(s) {
  if (s == null) return [];
  return String(s)
    .toLowerCase()
    .split(/[\s,\/\-()[\]{}]+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeWatchId(brand, family, ref) {
  return [slugify(brand), slugify(family), slugify(ref || "any")]
    .filter(Boolean)
    .join("-");
}

/**
 * Pick a stable "primary SKU token" so the same watch in both files merges
 * even when their reference strings differ in punctuation/abbreviation:
 *   "116610LN, 116610LV, 116619LB"  →  "116610ln"
 *   "116610LN/LV/LB"                →  "116610ln"
 *   "126610 (no date)"              →  "126610"
 *   "Pepsi 126710/116710 BLRO"      →  "126710"
 *   "All 116XXX Daytona Models"     →  "116xxx"
 * Preference: longest mixed-letter+digit token; tie-break alphabetic.
 * Fallback: longest pure-digit token of ≥4 chars; same tie-break.
 * If neither exists, return null and the caller will key by family alone.
 */
function primarySkuToken(refTokens) {
  const isUnit = (t) => /^\d+(mm|cm|in|ft|kg|hz)$/.test(t);
  const isVersion = (t) => /^v\d+$/.test(t);
  const has3Digits = (t) => /\d{3,}/.test(t);
  const isJunk = (t) => isUnit(t) || isVersion(t);
  const pickLongestThenAlpha = (arr) =>
    arr.sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
  // Prefer mixed-letter+digit tokens with ≥3 contiguous digits and non-junk
  // (e.g. "126610ln" beats "44mm" or "v2").
  const mixed = refTokens.filter(
    (t) => /[a-z]/.test(t) && /\d/.test(t) && has3Digits(t) && !isJunk(t)
  );
  if (mixed.length) return pickLongestThenAlpha(mixed.slice());
  // Fall back to pure-digit tokens of ≥3 chars (covers PAM numbers like 005).
  const numeric = refTokens.filter((t) => /^\d{3,}$/.test(t));
  if (numeric.length) return pickLongestThenAlpha(numeric.slice());
  return null;
}

/** Unify the two who-makes-the-best lists into one deduped index. */
function buildUnifiedWatches(guide, reptime) {
  const map = new Map(); // key: brand|family|ref-tokens-joined → record

  // Brands that the guide flags as legacy/old reference. Watch rows in
  // guide.watches don't carry the flag themselves — it lives on the brand
  // record — so we propagate it here.
  const legacyBrands = new Set(
    (guide.brands || []).filter((b) => b && b.legacy).map((b) => b.brand)
  );

  // Normalize brand spelling differences between the two sources.
  // "Jaeger-LeCoultre" (reptime) → "Jaeger LeCoultre" (guide). Keys are
  // canonicalized to lowercase + non-alphanumerics stripped.
  const BRAND_CANONICAL = {
    "jaegerlecoultre": "Jaeger LeCoultre",
  };
  const canonicalBrand = (raw) => {
    if (!raw) return raw;
    const key = String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
    return BRAND_CANONICAL[key] || raw;
  };

  // Coerce any cell-derived field to a string. Spreadsheet cells that were
  // pure numbers (e.g. 5327) come through as numbers in the JSON.
  const str = (v) => (v == null ? "" : String(v));

  const ingest = (rec, source) => {
    const brand = canonicalBrand(str(rec.brand));
    const family = str(rec.model_family);
    const ref = str(rec.model_number ?? rec.reference);
    const refTokens = tokenize(ref);
    const movement = str(rec.movement);
    const movementTokens = tokenize(movement);
    const sku = primarySkuToken(refTokens);
    // Movement matters too: a watch can have multiple movement options listed
    // as separate entries (e.g. Submariner 126610LN with 3235 Clone vs 2836
    // Asian — different factories recommended for each). Use the dominant
    // movement token (e.g. "3235", "2836", "miyota") as part of the key.
    const movementKey = movementTokens.find((t) => /\d/.test(t) || ["miyota","clone","custom","quartz","asian"].includes(t)) || "";
    const refKey = sku || (refTokens.length ? refTokens.join(" ") : "(any)");
    const key = `${brand.toLowerCase()}|${family.toLowerCase()}|${refKey}|${movementKey}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        id: makeWatchId(brand, family, ref || "any"),
        brand,
        model_family: family,
        reference: ref || null,
        reference_alternatives: [],
        movement: str(rec.movement) || null,
        legacy: !!rec.legacy || legacyBrands.has(brand),
        notes: str(rec.notes) || null,
        recommendations: [],
        sources: new Set(),
        _factoryByCode: new Map(),
        _refTokens: new Set(refTokens),
      };
      map.set(key, entry);
    }
    if (ref && entry.reference !== ref && !entry.reference_alternatives.includes(ref)) {
      // Track alternate textual forms; preserve the first-seen as canonical.
      if (!entry.reference) entry.reference = ref;
      else entry.reference_alternatives.push(ref);
    }
    if (!entry.movement && rec.movement) entry.movement = str(rec.movement);
    if (!entry.notes && rec.notes) entry.notes = str(rec.notes);
    entry.sources.add(source);

    // Merge recommendations by factory code, keeping the best rank and
    // strongest tier across both files.
    for (const r of rec.recommendations || []) {
      if (!r || !r.factory) continue;
      const code = r.factory;
      const existing = entry._factoryByCode.get(code);
      if (!existing) {
        entry._factoryByCode.set(code, {
          factory: code,
          rank: r.rank || 99,
          tier: r.tier || null,
          sources: new Set([source]),
        });
      } else {
        existing.sources.add(source);
        if ((r.rank || 99) < existing.rank) existing.rank = r.rank;
        if (TIER_RANK[r.tier] > TIER_RANK[existing.tier]) existing.tier = r.tier;
      }
    }
  };

  // Ingest guide entries — these are the spreadsheet-derived rows.
  for (const w of guide.watches || []) ingest(w, "guide");
  // Ingest reptime entries.
  for (const w of reptime.who_makes_the_best || []) ingest(w, "reptime");

  // Finalize each entry: sort recommendations, build search tokens.
  const all = [];
  for (const e of map.values()) {
    const recs = Array.from(e._factoryByCode.values());
    recs.sort((a, b) => {
      // Prefer lower rank, then higher tier.
      if (a.rank !== b.rank) return a.rank - b.rank;
      return TIER_RANK[b.tier] - TIER_RANK[a.tier];
    });
    e.recommendations = recs.map((r, i) => ({
      rank: i + 1,
      factory: r.factory,
      tier: r.tier,
      sources: Array.from(r.sources).sort(),
    }));

    // Build the search-token set: brand + family + reference (canonical &
    // alternates) + movement + factory codes. Lowercased.
    const tokens = new Set();
    for (const t of tokenize(e.brand)) tokens.add(t);
    for (const t of tokenize(e.model_family)) tokens.add(t);
    for (const t of e._refTokens) tokens.add(t);
    for (const alt of e.reference_alternatives) {
      for (const t of tokenize(alt)) tokens.add(t);
    }
    for (const t of tokenize(e.movement)) tokens.add(t);
    for (const r of e.recommendations) {
      for (const t of tokenize(r.factory)) tokens.add(t);
    }
    e.search_tokens = Array.from(tokens);
    e.sources = Array.from(e.sources).sort();

    // Strip private fields before exposing.
    delete e._factoryByCode;
    delete e._refTokens;
    all.push(e);
  }

  // Stable sort: brand → family → reference for deterministic display.
  const s = (v) => String(v == null ? "" : v);
  all.sort((a, b) =>
    s(a.brand).localeCompare(s(b.brand)) ||
    s(a.model_family).localeCompare(s(b.model_family)) ||
    s(a.reference).localeCompare(s(b.reference))
  );
  return all;
}

function buildDealers(reptime) {
  const list = (reptime.trusted_dealers && reptime.trusted_dealers.dealers) || [];
  const scored = list.map((d) => {
    const forumStr = (d.forum || "").toUpperCase();
    const forumCodes = forumStr.split(/\s+/).filter(Boolean);
    const score = forumCodes.reduce(
      (acc, c) => acc + (FORUM_WEIGHTS[c] || 0),
      0
    );
    return { ...d, id: slugify(d.name), forum_codes: forumCodes, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || "").localeCompare(b.name || "");
  });
  return scored;
}

/**
 * Resolve the best link for a (dealer, watch) pair.
 * Returns { url, kind, q? } where kind ∈ "direct" | "search" | "home".
 *   "direct" — exact product URL from dealer-deep-links.json
 *   "search" — dealer search-URL template applied to the watch's primary SKU
 *              (or "${brand} ${family}" when no SKU exists)
 *   "home"   — fall through to the dealer's homepage
 */
function dealerLinkForWatch(dealer, w) {
  if (!dealer || !dealer.id) {
    return { url: dealer && dealer.website_url ? dealer.website_url : "", kind: "home" };
  }
  // 1. Catalog offer
  const offer = state.dealerCatalog?.offers?.[w.id]?.[dealer.id];
  if (offer && offer.url) {
    return { url: offer.url, kind: "direct", offer };
  }

  // 2. Hand-curated direct override
  const direct = state.dealerDeepLinks?.[w.id]?.[dealer.id];
  if (direct) return { url: direct, kind: "direct" };

  // 3. Dealer search-URL template
  const tmpl = state.dealerSearch?.[dealer.id];
  if (tmpl && tmpl.template) {
    const refTokens = w.reference ? tokenize(w.reference) : [];
    const sku = primarySkuToken(refTokens);
    const useSku = tmpl.qSource !== "brandFamily" && sku;
    const q = useSku ? sku : `${w.brand || ""} ${w.model_family || ""}`.trim();
    if (q) {
      const url = tmpl.template.replace("{q}", encodeURIComponent(q));
      return { url, kind: "search", q };
    }
  }

  // 4. Homepage fallback
  return { url: dealer.website_url || "", kind: "home" };
}

function buildFactoryInfo(reptime) {
  const info = new Map();
  const factories = (reptime.factories && reptime.factories.major_factories) || [];
  for (const f of factories) {
    if (!f.factory) continue;
    // The key we'll match against is the factory CODE (the part before any
    // parenthetical). e.g. "Clean (CF)" → also usable as "Clean" or "CF".
    const fullName = f.factory;
    const codeMatch = fullName.match(/\(([A-Z0-9]+)\)/);
    const baseName = fullName.split(/\s*\(/)[0].trim();
    const entry = { display: fullName, specialty: f.specialty || null, description: null };
    info.set(fullName, entry);
    if (baseName && baseName !== fullName) info.set(baseName, entry);
    if (codeMatch) info.set(codeMatch[1], entry);
  }
  // Layer in glossary descriptions for any factory term.
  const glossary = reptime.glossary || [];
  for (const cat of glossary) {
    if (cat.category && cat.category.toLowerCase().includes("factor")) {
      for (const t of cat.terms || []) {
        const term = t.term;
        if (!term) continue;
        const hit = info.get(term) || info.get(term.split(/\s*\/\s*/)[0]);
        if (hit) hit.description = t.definition || hit.description;
        // Also register the glossary term standalone for uncovered codes.
        if (!info.has(term)) {
          info.set(term, { display: term, specialty: null, description: t.definition || null });
        }
      }
    }
  }
  return info;
}

function buildGlossary(reptime) {
  const map = new Map();
  for (const cat of reptime.glossary || []) {
    for (const t of cat.terms || []) {
      if (t.term) map.set(t.term.toLowerCase(), { ...t, category: cat.category });
    }
  }
  return map;
}

function buildBrandList(watches) {
  const counts = new Map();
  for (const w of watches) {
    if (!w.brand) continue;
    counts.set(w.brand, (counts.get(w.brand) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

/**
 * Group watches into model families and compute a "consensus best factory"
 * for each: the factory that appears most often as rank-1 across the
 * family's variants, ties broken by highest tier (NWBIG > Super Rep).
 * Each family gets a stable id used for image lookup and #family/<id> routing.
 */
function buildFamilies(watches) {
  const map = new Map();
  for (const w of watches) {
    if (!w.brand || !w.model_family) continue;
    const id = `${slugify(w.brand)}--${slugify(w.model_family)}`;
    let fam = map.get(id);
    if (!fam) {
      fam = {
        id,
        brand: w.brand,
        family: w.model_family,
        legacy: !!w.legacy,
        variants: [],
        _topFactoryCounts: new Map(),
      };
      map.set(id, fam);
    }
    fam.variants.push(w);
    if (w.legacy) fam.legacy = true;
    const top = w.recommendations[0];
    if (top && top.factory) {
      const cur = fam._topFactoryCounts.get(top.factory) ||
                  { count: 0, bestTier: null };
      cur.count++;
      if (TIER_RANK[top.tier] > TIER_RANK[cur.bestTier]) cur.bestTier = top.tier;
      fam._topFactoryCounts.set(top.factory, cur);
    }
  }
  for (const fam of map.values()) {
    let best = null;
    for (const [factory, info] of fam._topFactoryCounts) {
      if (
        !best ||
        info.count > best.count ||
        (info.count === best.count &&
         TIER_RANK[info.bestTier] > TIER_RANK[best.tier])
      ) {
        best = { factory, count: info.count, tier: info.bestTier };
      }
    }
    fam.consensus_best = best;
    fam.variant_count = fam.variants.length;
    delete fam._topFactoryCounts;
  }
  return Array.from(map.values()).sort((a, b) => {
    // Non-legacy first, then by brand, then by family.
    if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
    return a.brand.localeCompare(b.brand) ||
           a.family.localeCompare(b.family);
  });
}

// ============================================================================
// Search / scoring
// ============================================================================

function search(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const results = [];
  for (const w of state.watches) {
    let score = 0;
    const tokSet = new Set(w.search_tokens);
    for (const qt of tokens) {
      if (tokSet.has(qt)) {
        score += 5;
      } else {
        // Substring match: cheaper but useful for partial refs.
        for (const wt of w.search_tokens) {
          if (wt.includes(qt) && qt.length >= 3) {
            score += 3;
            break;
          }
        }
      }
    }
    // Brand / family exact-match bonuses.
    const brandLower = (w.brand || "").toLowerCase();
    const famLower = (w.model_family || "").toLowerCase();
    for (const qt of tokens) {
      if (qt === brandLower) score += 2;
      if (qt === famLower) score += 1;
    }
    if (score > 0) {
      results.push({ watch: w, score });
    }
  }

  // Sort: score desc, then NWBIG-tier-present > Super-Rep > untiered, then a-z.
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = bestTierRank(a.watch);
    const tb = bestTierRank(b.watch);
    if (tb !== ta) return tb - ta;
    return (a.watch.brand || "").localeCompare(b.watch.brand || "") ||
           (a.watch.model_family || "").localeCompare(b.watch.model_family || "");
  });
  return results;
}

function bestTierRank(w) {
  let best = 0;
  for (const r of w.recommendations) {
    const t = TIER_RANK[r.tier] || 0;
    if (t > best) best = t;
  }
  return best;
}

// ============================================================================
// Rendering
// ============================================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showBanner(msg, isError = false) {
  const b = $("#banner");
  b.textContent = msg;
  b.classList.toggle("error", !!isError);
  b.hidden = false;
}

function renderStats() {
  $("#stats").textContent =
    `${state.watches.length} WATCHES · ${state.dealers.length} DEALERS · ${state.brands.length} BRANDS`;
  const hdr = document.getElementById("hdr-records");
  if (hdr) hdr.textContent = `${state.watches.length} RECORDS`;
}

function wireSearch() {
  const input = $("#q");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 60);
  });
  // Run once on load in case the field is non-empty (e.g. after refresh).
  if (input.value) runSearch();
}

function wireFilters() {
  $("#sort-select").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    renderRoute();
  });
  $("#in-stock-only").addEventListener("change", (e) => {
    state.filters.inStock = e.target.checked;
    renderRoute();
  });
  $("#price-min").addEventListener("input", (e) => {
    state.filters.minPrice = e.target.value ? parseFloat(e.target.value) : null;
    clearTimeout(state.filterTimer);
    state.filterTimer = setTimeout(renderRoute, 200);
  });
  $("#price-max").addEventListener("input", (e) => {
    state.filters.maxPrice = e.target.value ? parseFloat(e.target.value) : null;
    clearTimeout(state.filterTimer);
    state.filterTimer = setTimeout(renderRoute, 200);
  });
}

function watchPassesFilters(w) {
  if (state.filters.inStock) {
    const offers = state.dealerCatalog?.offers?.[w.id];
    let hasStock = false;
    if (offers) {
      for (const d of Object.values(offers)) {
        if (d && d.in_stock) { hasStock = true; break; }
      }
    }
    if (!hasStock) return false;
  }
  if (state.filters.minPrice != null || state.filters.maxPrice != null) {
    const lp = getLowestPrice(w);
    if (!lp) return false;
    if (state.filters.minPrice != null && lp.price < state.filters.minPrice) return false;
    if (state.filters.maxPrice != null && lp.price > state.filters.maxPrice) return false;
  }
  return true;
}

function applyFiltersAndSort(watchList) {
  let res = watchList.filter(watchPassesFilters);
  if (state.filters.sort === "price_asc") {
    res.sort((a, b) => {
      const pa = getLowestPrice(a)?.price || Infinity;
      const pb = getLowestPrice(b)?.price || Infinity;
      return pa - pb;
    });
  } else if (state.filters.sort === "price_desc") {
    res.sort((a, b) => {
      const pa = getLowestPrice(a)?.price || 0;
      const pb = getLowestPrice(b)?.price || 0;
      return pb - pa;
    });
  } else if (state.filters.sort === "rank") {
    res.sort((a, b) => {
      const ta = bestTierLabel(a);
      const tb = bestTierLabel(b);
      return (TIER_RANK[tb] || 0) - (TIER_RANK[ta] || 0);
    });
  }
  return res;
}

// ----- Routing -------------------------------------------------------------
// Hash → view selector. Empty/'#browse' = catalog grid; '#family/<id>' =
// family detail; otherwise the search-input value drives results.
function getRoute() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h || h === "browse") return { view: "browse" };
  const mCompare = h.match(/^compare\/(.+)$/);
  if (mCompare) return { view: "compare", ids: decodeURIComponent(mCompare[1]).split(",") };
  const mFam = h.match(/^family\/(.+)$/);
  if (mFam) return { view: "family", id: decodeURIComponent(mFam[1]) };
  const mWatch = h.match(/^watch\/(.+)$/);
  if (mWatch) return { view: "watch", id: decodeURIComponent(mWatch[1]) };
  const mDealer = h.match(/^dealer\/(.+)$/);
  if (mDealer) return { view: "dealer", id: decodeURIComponent(mDealer[1]) };
  const mFactory = h.match(/^factory\/(.+)$/);
  if (mFactory) return { view: "factory", id: decodeURIComponent(mFactory[1]) };
  if (h === "about") return { view: "about" };
  return { view: "browse" };
}

function wireRouting() {
  window.addEventListener("hashchange", renderRoute);
}

function renderRoute() {
  const route = getRoute();
  const q = $("#q").value.trim();
  const results = $("#results");
  const browse = $("#browse-view");
  const detail = $("#family-detail");
  const watchDetail = $("#watch-detail");
  const dealerDetail = $("#dealer-detail");
  const factoryDetail = $("#factory-detail");
  const aboutPage = $("#about-page");
  const comparePage = $("#compare-view");

  const views = [browse, detail, watchDetail, dealerDetail, factoryDetail, aboutPage, comparePage, results];
  const hideAll = () => views.forEach((v) => { if (v) v.hidden = true; });

  const filterSidebar = $("#filter-sidebar");
  if (route.view === "browse" || q) {
    filterSidebar.hidden = false;
  } else {
    filterSidebar.hidden = true;
  }

  // A non-empty search query overrides whatever route we're on.
  if (q) {
    hideAll();
    results.hidden = false;
    runSearch();
    return;
  }

  results.innerHTML = "";
  $("#count").textContent = "";

  if (route.view === "family") {
    const fam = state.familyById.get(route.id);
    if (!fam) {
      window.location.hash = "browse";
      return;
    }
    hideAll();
    detail.hidden = false;
    renderFamilyDetail(fam);
  } else if (route.view === "watch") {
    const w = state.watchById.get(route.id);
    if (!w) {
      window.location.hash = "browse";
      return;
    }
    hideAll();
    watchDetail.hidden = false;
    renderWatchDetail(w);
  } else if (route.view === "dealer") {
    const d = state.dealers.find(x => x.id === route.id);
    if (!d) {
      window.location.hash = "browse";
      return;
    }
    hideAll();
    dealerDetail.hidden = false;
    renderDealerDetail(d);
  } else if (route.view === "factory") {
    hideAll();
    factoryDetail.hidden = false;
    renderFactoryDetail(route.id);
  } else if (route.view === "about") {
    hideAll();
    aboutPage.hidden = false;
    renderAboutPage();
  } else if (route.view === "compare") {
    hideAll();
    comparePage.hidden = false;
    renderComparePage(route.ids);
  } else {
    hideAll();
    browse.hidden = false;
    renderBrowseGrid();
  }
}

function runSearch() {
  const q = $("#q").value.trim();
  const resultsEl = $("#results");
  const browse = $("#browse-view");
  const detail = $("#family-detail");
  const count = $("#count");

  resultsEl.innerHTML = "";

  if (!q) {
    // Hand back to the route renderer (browse grid / family detail).
    resultsEl.hidden = true;
    count.textContent = "";
    renderRoute();
    return;
  }
  resultsEl.hidden = false;
  browse.hidden = true;
  detail.hidden = true;
  $("#watch-detail").hidden = true;

  const hits = search(q);
  let sortedWatches = hits.map(h => h.watch).filter(watchPassesFilters);
  if (state.filters.sort !== "relevance") {
    sortedWatches = applyFiltersAndSort(sortedWatches);
  }

  if (!sortedWatches.length) {
    count.textContent = hits.length ? "0 matches (filtered)" : "0 matches";
    if (!hits.length) resultsEl.appendChild(renderNoMatch(q));
    else resultsEl.innerHTML = "<div class='browse-empty' style='margin-top:24px; color:var(--fg-dim)'>No watches match the current filters.</div>";
    return;
  }

  const top = sortedWatches.slice(0, MAX_RESULTS);
  count.textContent = `${sortedWatches.length} match${sortedWatches.length === 1 ? "" : "es"}`;

  top.forEach(w => resultsEl.appendChild(renderCard(w)));
}

// ============================================================================
// Browse view (family grid + detail)
// ============================================================================

/** Look up an image for a family. Chain: family-id → brand-slug → null. */
function familyImageUrl(fam) {
  if (state.images[fam.id]) return state.images[fam.id];
  for (const fw of fam.variants) {
    const fOffers = state.dealerCatalog?.offers?.[fw.id] || {};
    for (const d of state.dealers) {
      const offer = fOffers[d.id];
      if (offer && offer.images && offer.images.length > 0) return offer.images[0];
    }
  }
  const brandKey = slugify(fam.brand);
  if (state.images[brandKey]) return state.images[brandKey];
  return null;
}

/** Look up an image for a single watch.
 *  Chain: watch-id → family-id → brand-slug → null. Most specific wins.
 */
function watchImageUrl(w) {
  if (state.images[w.id]) return state.images[w.id];
  const offers = state.dealerCatalog?.offers?.[w.id] || {};
  for (const d of state.dealers) {
    const offer = offers[d.id];
    if (offer && offer.images && offer.images.length > 0) return offer.images[0];
  }
  const famId = `${slugify(w.brand)}--${slugify(w.model_family)}`;
  const fam = state.familyById.get(famId);
  if (fam) {
    for (const fw of fam.variants) {
      const fOffers = state.dealerCatalog?.offers?.[fw.id] || {};
      for (const d of state.dealers) {
        const offer = fOffers[d.id];
        if (offer && offer.images && offer.images.length > 0) return offer.images[0];
      }
    }
  }
  if (state.images[famId]) return state.images[famId];
  const brandKey = slugify(w.brand);
  if (state.images[brandKey]) return state.images[brandKey];
  return null;
}

function getLowestPrice(w) {
  const offers = state.dealerCatalog?.offers?.[w.id];
  if (!offers) return null;
  let min = null;
  for (const d of state.dealers) {
    const o = offers[d.id];
    if (o && o.price != null) {
      let usd = o.price;
      if (o.currency && o.currency !== "USD" && state.fxRates[o.currency]) {
        usd = o.price * state.fxRates[o.currency];
      }
      if (!min || usd < min.usd) {
        min = { price: o.price, currency: o.currency || "USD", usd, dealer: d.name, scrapedAt: o.scraped_at };
      }
    }
  }
  return min;
}

function formatPriceBlock(price, currency, scrapedAt) {
  const wrap = document.createElement("div");
  wrap.className = "price-block";

  const primary = document.createElement("div");
  primary.className = "price-primary";

  if (price == null) {
    primary.textContent = "PRICE UNKNOWN";
    wrap.appendChild(primary);
    return wrap;
  }

  let usdAmount = price;
  let isUsd = (currency === "USD" || !currency);
  
  if (!isUsd && state.fxRates[currency]) {
    usdAmount = Math.round(price * state.fxRates[currency]);
  }

  primary.textContent = `$${usdAmount} USD`;
  wrap.appendChild(primary);

  if (!isUsd) {
    const secondary = document.createElement("div");
    secondary.className = "price-secondary";
    const symbol = currency === "CNY" || currency === "JPY" ? "¥" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency;
    secondary.textContent = `≈ ${symbol}${price}`;
    wrap.appendChild(secondary);
  }

  if (scrapedAt) {
    const tertiary = document.createElement("div");
    tertiary.className = "price-tertiary";
    const days = Math.floor((Date.now() - new Date(scrapedAt).getTime()) / 86400000);
    tertiary.textContent = `↻ ${days === 0 ? "today" : days + " day" + (days > 1 ? "s" : "") + " ago"}`;
    if (days > 30) tertiary.style.color = "var(--danger)";
    else if (days > 14) tertiary.style.color = "var(--accent)";
    wrap.appendChild(tertiary);
  }

  return wrap;
}

/** Build an <img> or placeholder slot for the given URL + alt label.
 *  On load failure, the <img> is removed and the slot turns into the
 *  striped placeholder showing the alt label. */
function buildImageSlot(url, label, extraClass = "") {
  const slot = document.createElement("div");
  slot.className = "img-slot" + (extraClass ? " " + extraClass : "");
  if (url) {
    const img = document.createElement("img");
    img.alt = label || "";
    img.loading = "lazy";
    img.src = url;
    img.addEventListener("error", () => {
      img.remove();
      slot.classList.add("placeholder");
      slot.textContent = label;
    });
    slot.appendChild(img);
  } else {
    slot.classList.add("placeholder");
    slot.textContent = label;
  }
  return slot;
}

/** Build a Google Images query for a family — used as a "see photos" link
 *  when no local image is configured. */
function googleImageUrl(fam) {
  const q = encodeURIComponent(`${fam.brand} ${fam.family} watch`);
  return `https://www.google.com/search?tbm=isch&q=${q}`;
}

function renderBrowseGrid() {
  // Brand chips (filter)
  const chipBox = $("#brand-chips");
  chipBox.innerHTML = "";
  const totalWatches = state.brands.reduce((n, b) => n + b.count, 0);
  const allChip = makeBrandChip("all", "All", totalWatches);
  chipBox.appendChild(allChip);
  for (const { brand, count } of state.brands) {
    chipBox.appendChild(makeBrandChip(brand, brand, undefined, count));
  }
  updateChipActiveState();

  renderBrowseGridBody();
}

function renderBrowseGridBody() {
  const grid = $("#family-grid");
  grid.innerHTML = "";
  const filter = state.brandFilter;
  let families = filter === "all"
    ? state.families
    : state.families.filter((f) => f.brand === filter);

  // Apply filters
  families = families.map(f => ({
    ...f,
    variants: applyFiltersAndSort(f.variants)
  })).filter(f => f.variants.length > 0);

  updateBrowseSummary(families);

  if (!families.length) {
    const empty = document.createElement("div");
    empty.className = "browse-empty";
    empty.textContent = "No families match this filter.";
    grid.appendChild(empty);
    return;
  }
  for (const fam of families) grid.appendChild(renderFamilyCard(fam));
}

function updateBrowseSummary(families) {
  const el = $("#browse-summary");
  if (!el) return;
  const watchCount = families.reduce((n, f) => n + f.variant_count, 0);
  el.textContent =
    `Showing ${families.length} famil${families.length === 1 ? "y" : "ies"}` +
    ` · ${watchCount} watch${watchCount === 1 ? "" : "es"}`;
}

function makeBrandChip(value, label, exactCount, fallbackCount) {
  const btn = document.createElement("button");
  btn.className = "brand-chip";
  btn.dataset.value = value;
  const ct = exactCount != null ? exactCount : fallbackCount;
  btn.innerHTML = `${escape(label)}<span class="ct">${ct}</span>`;
  btn.addEventListener("click", () => {
    state.brandFilter = value;
    updateChipActiveState();
    // Re-render only the grid; chips don't need rebuilding.
    renderBrowseGridBody();
  });
  return btn;
}

function updateChipActiveState() {
  $$(".brand-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.value === state.brandFilter);
  });
}

function renderFamilyCard(fam) {
  const a = document.createElement("a");
  a.className = "family-card" + (fam.legacy ? " legacy" : "");
  a.href = `#family/${encodeURIComponent(fam.id)}`;

  const slot = buildImageSlot(familyImageUrl(fam), fam.brand, "family-img");
  a.appendChild(slot);

  // Body
  const body = document.createElement("div");
  body.className = "family-body";

  const title = document.createElement("div");
  title.className = "family-title";
  title.appendChild(span("family-brand", fam.brand));
  title.appendChild(span("family-name", fam.family));
  if (fam.legacy) title.appendChild(span("legacy-tag", "legacy"));
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "family-meta";
  meta.appendChild(span("variants",
    `${fam.variant_count} variant${fam.variant_count === 1 ? "" : "s"}`));
  if (fam.consensus_best) {
    const best = document.createElement("span");
    best.className = "family-best";
    best.appendChild(span("best-label", "Best"));
    best.appendChild(span("best-factory", fam.consensus_best.factory));
    if (fam.consensus_best.tier) {
      best.appendChild(tierPill(fam.consensus_best.tier));
    }
    meta.appendChild(best);
  }
  body.appendChild(meta);
  a.appendChild(body);
  return a;
}

function renderFamilyDetail(fam) {
  const root = $("#family-detail-body");
  root.innerHTML = "";

  // Header: hero image + brand/family/best/photo link
  const header = document.createElement("div");
  header.className = "family-hero";

  const heroImg = buildImageSlot(familyImageUrl(fam), fam.brand, "family-hero-img");
  header.appendChild(heroImg);

  const heroText = document.createElement("div");
  heroText.className = "family-hero-text";
  const h2 = document.createElement("h2");
  h2.innerHTML = `${escape(fam.brand)} <span class="family-hero-name">${escape(fam.family)}</span>`;
  heroText.appendChild(h2);

  const meta = document.createElement("p");
  meta.className = "family-hero-meta";
  meta.textContent = `${fam.variant_count} variant${fam.variant_count === 1 ? "" : "s"} · `;
  if (fam.consensus_best) {
    const strong = document.createElement("strong");
    strong.textContent = `Most-recommended factory: ${fam.consensus_best.factory}`;
    meta.appendChild(strong);
    if (fam.consensus_best.tier) {
      meta.appendChild(text(" "));
      meta.appendChild(tierPill(fam.consensus_best.tier));
    }
  }
  heroText.appendChild(meta);

  if (fam.legacy) {
    const legacyNote = document.createElement("p");
    legacyNote.className = "legacy-note";
    legacyNote.textContent = "Legacy / old reference data — for historical research only.";
    heroText.appendChild(legacyNote);
  }

  const photoLink = document.createElement("a");
  photoLink.className = "photo-link";
  photoLink.href = googleImageUrl(fam);
  photoLink.target = "_blank";
  photoLink.rel = "noopener";
  photoLink.textContent = "See photos on Google Images →";
  heroText.appendChild(photoLink);

  header.appendChild(heroText);
  root.appendChild(header);

  // Stocked At Rail
  const stockedDealers = new Set();
  fam.variants.forEach(w => {
    const offers = state.dealerCatalog?.offers?.[w.id];
    if (offers) {
      for (const dId of Object.keys(offers)) {
        if (offers[dId] && offers[dId].in_stock) stockedDealers.add(dId);
      }
    }
  });

  if (stockedDealers.size > 0) {
    const stockLabel = document.createElement("div");
    stockLabel.className = "section-label";
    stockLabel.style.margin = "20px 0 10px";
    stockLabel.textContent = "Currently Stocked At";
    root.appendChild(stockLabel);

    const stockRail = document.createElement("div");
    stockRail.style.display = "flex";
    stockRail.style.flexWrap = "wrap";
    stockRail.style.gap = "8px";
    
    Array.from(stockedDealers).forEach(dId => {
      const d = state.dealers.find(x => x.id === dId);
      if (d) {
        const dLink = document.createElement("a");
        dLink.className = "brand-chip";
        dLink.href = `#dealer/${encodeURIComponent(d.id)}`;
        dLink.textContent = d.name;
        stockRail.appendChild(dLink);
      }
    });
    root.appendChild(stockRail);
  }

  // Community Notes (aggregated)
  const allNotes = new Set();
  fam.variants.forEach(w => {
    if (w.notes) allNotes.add(w.notes);
  });
  if (allNotes.size > 0) {
    const notesLabel = document.createElement("div");
    notesLabel.className = "section-label";
    notesLabel.style.margin = "20px 0 10px";
    notesLabel.textContent = "Community Notes";
    root.appendChild(notesLabel);

    Array.from(allNotes).forEach(n => {
      const noteBox = document.createElement("div");
      noteBox.className = "notes-box";
      noteBox.textContent = n;
      root.appendChild(noteBox);
    });
  }

  // Variants list — reuse renderCard, expand the first if there's only one.
  const variantsHeader = document.createElement("div");
  variantsHeader.style.display = "flex";
  variantsHeader.style.alignItems = "baseline";
  variantsHeader.style.justifyContent = "space-between";
  variantsHeader.style.margin = "20px 0 10px";

  const variantsLabel = document.createElement("div");
  variantsLabel.className = "section-label";
  variantsLabel.style.margin = "0";
  variantsLabel.style.borderTop = "none";
  variantsLabel.style.paddingTop = "0";
  variantsLabel.textContent = fam.variant_count === 1 ? "Recommendation" : "Variants";
  variantsHeader.appendChild(variantsLabel);

  if (fam.variant_count > 1) {
    const compareLink = document.createElement("a");
    compareLink.href = `#compare/${fam.variants.map(w => encodeURIComponent(w.id)).join(',')}`;
    compareLink.style.fontSize = "11px";
    compareLink.style.textTransform = "uppercase";
    compareLink.style.letterSpacing = "0.1em";
    compareLink.textContent = "[ Compare Variants ]";
    variantsHeader.appendChild(compareLink);
  }

  root.appendChild(variantsHeader);

  const variantsWrap = document.createElement("div");
  variantsWrap.className = "results";
  fam.variants.forEach((w) => {
    // Always collapsed-by-default in the family detail list — user expands
    // any individual watch to see its factory + dealer recs.
    variantsWrap.appendChild(renderCard(w, false));
  });
  root.appendChild(variantsWrap);
}

function renderCard(w, expanded) {
  const card = document.createElement("a");
  card.href = `#watch/${encodeURIComponent(w.id)}`;
  card.className = "card" + (w.legacy ? " legacy" : "");
  card.dataset.id = w.id;

  // Head
  const head = document.createElement("div");
  head.className = "card-head";

  // Image slot
  head.appendChild(buildImageSlot(watchImageUrl(w), w.brand || "—", "card-img"));

  const titleWrap = document.createElement("div");
  titleWrap.className = "card-title-wrap";

  const titleLine1 = document.createElement("div");
  titleLine1.className = "card-title-line";
  titleLine1.appendChild(span("brand", w.brand || "Unknown"));
  if (w.model_family) {
    titleLine1.appendChild(span("sep", "//"));
    titleLine1.appendChild(span("family", w.model_family));
  }
  if (w.legacy) titleLine1.appendChild(span("legacy-tag", "legacy"));
  titleWrap.appendChild(titleLine1);

  const titleLine2 = document.createElement("div");
  titleLine2.className = "card-title-sub";
  if (w.reference) titleLine2.appendChild(span("ref", w.reference));
  if (w.movement) {
    if (w.reference) titleLine2.appendChild(span("sep", "·"));
    titleLine2.appendChild(span("movement", w.movement));
  }
  if (titleLine2.childNodes.length) titleWrap.appendChild(titleLine2);

  // Best factory + tier
  if (w.recommendations.length > 0) {
    const facLine = document.createElement("div");
    facLine.className = "card-title-sub";
    facLine.style.marginTop = "4px";
    const bestRec = w.recommendations[0];
    facLine.appendChild(span("factory-name", bestRec.factory));
    if (bestRec.tier) facLine.appendChild(tierPill(bestRec.tier));
    titleWrap.appendChild(facLine);
  }

  // Lowest price
  const lp = getLowestPrice(w);
  if (lp) {
    const priceLine = document.createElement("div");
    priceLine.className = "card-title-sub card-price";
    priceLine.style.marginTop = "4px";
    
    const pb = formatPriceBlock(lp.price, lp.currency, lp.scrapedAt);
    
    const dName = document.createElement("div");
    dName.style.textTransform = "uppercase";
    dName.style.fontSize = "10px";
    dName.style.color = "var(--fg-dim)";
    dName.style.marginTop = "2px";
    dName.textContent = `FROM ${lp.dealer}`;
    
    priceLine.appendChild(pb);
    priceLine.appendChild(dName);
    titleWrap.appendChild(priceLine);
  }

  head.appendChild(titleWrap);

  const headRight = document.createElement("div");
  headRight.className = "card-head-right";
  const viewBtn = document.createElement("span");
  viewBtn.className = "chev";
  viewBtn.style.fontSize = "10px";
  viewBtn.style.letterSpacing = "0.1em";
  viewBtn.textContent = "[ VIEW ]";
  headRight.appendChild(viewBtn);
  head.appendChild(headRight);

  card.appendChild(head);
  return card;
}

function toggleCard(card) {
  const isOpen = card.hasAttribute("open");
  if (isOpen) card.removeAttribute("open");
  else card.setAttribute("open", "");
  const head = card.querySelector(".card-head");
  if (head) head.setAttribute("aria-expanded", isOpen ? "false" : "true");
}

function renderFactories(w) {
  const wrap = document.createElement("div");
  wrap.className = "factories";
  if (!w.recommendations.length) {
    const note = document.createElement("div");
    note.className = "dealers-note";
    note.textContent = "No factory recommendations recorded for this watch.";
    wrap.appendChild(note);
    return wrap;
  }
  // Show up to 3 factories on the result card; rest collapsed.
  const visible = w.recommendations.slice(0, 3);
  const hidden = w.recommendations.slice(3);
  for (const r of visible) wrap.appendChild(renderFactoryRow(r));
  if (hidden.length) {
    const more = document.createElement("button");
    more.className = "show-more";
    more.textContent = `Show ${hidden.length} more factor${hidden.length === 1 ? "y" : "ies"}`;
    more.addEventListener("click", () => {
      more.remove();
      for (const r of hidden) wrap.appendChild(renderFactoryRow(r));
    });
    wrap.appendChild(more);
  }
  return wrap;
}

function renderFactoryRow(r) {
  const row = document.createElement("div");
  row.className = "factory-row" + (r.rank === 1 ? " rank-1" : "");

  row.appendChild(span("rank", `#${r.rank}`));

  const name = document.createElement("a");
  name.className = "factory-name";
  name.textContent = r.factory;
  name.title = "View factory info";
  name.href = `#factory/${encodeURIComponent(r.factory)}`;
  row.appendChild(name);

  const info = state.factoryInfo.get(r.factory) ||
               state.factoryInfo.get(r.factory.split(/\s+/)[0]);
  const specialty = document.createElement("span");
  specialty.className = "factory-specialty";
  specialty.textContent = info && info.specialty ? `Specialty: ${info.specialty}` : "";
  row.appendChild(specialty);

  if (r.tier) row.appendChild(tierPill(r.tier));
  else row.appendChild(span("tier none", ""));

  // Source chips on a second row when applicable
  if (r.sources && r.sources.length === 2) {
    const sources = document.createElement("div");
    sources.className = "factory-sources";
    sources.style.gridColumn = "2 / -1";
    sources.textContent = "Confirmed by both spreadsheet and reptime.help";
    row.appendChild(sources);
  } else if (r.sources && r.sources.length === 1) {
    const sources = document.createElement("div");
    sources.className = "factory-sources";
    sources.style.gridColumn = "2 / -1";
    sources.textContent = r.sources[0] === "guide"
      ? "Source: spreadsheet"
      : "Source: reptime.help";
    row.appendChild(sources);
  }
  return row;
}

function renderDealers(w) {
  const wrap = document.createElement("div");
  wrap.className = "dealers";

  const note = document.createElement("p");
  note.className = "dealers-note";
  note.textContent = "Any TD can source any watch currently in production. Top picks are ranked by forum-vetting score.";
  wrap.appendChild(note);

  const top = state.dealers.slice(0, MAX_DEALERS_DEFAULT);
  for (let i = 0; i < top.length; i++) wrap.appendChild(renderDealerRow(top[i], i + 1, w));

  if (state.dealers.length > MAX_DEALERS_DEFAULT) {
    const more = document.createElement("button");
    more.className = "show-more";
    more.textContent = `Show all ${state.dealers.length} trusted dealers`;
    more.addEventListener("click", () => {
      more.remove();
      const rest = state.dealers.slice(MAX_DEALERS_DEFAULT);
      rest.forEach((d, idx) => wrap.appendChild(renderDealerRow(d, MAX_DEALERS_DEFAULT + idx + 1, w)));
    });
    wrap.appendChild(more);
  }
  return wrap;
}

function renderDealerRow(d, rank, w) {
  const row = document.createElement("div");
  row.className = "dealer-row";

  row.appendChild(span("rank", `#${rank}`));

  const name = document.createElement("a");
  name.className = "dealer-name";
  name.href = `#dealer/${encodeURIComponent(d.id)}`;
  name.textContent = d.name;
  if (d.notes) {
    const small = document.createElement("div");
    small.style.fontSize = "12px";
    small.style.color = "var(--fg-dim)";
    small.textContent = d.notes;
    name.appendChild(small);
  }
  row.appendChild(name);

  // Website — most-specific wins: direct override → dealer search → homepage
  if (d.website_url) {
    const { url, kind, q } = dealerLinkForWatch(d, w);
    const a = document.createElement("a");
    a.className = "dealer-action";
    a.href = url || d.website_url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Website";
    a.dataset.linkKind = kind;
    const host = d.website || "site";
    if (kind === "search") {
      a.title = `Search for ${q} on ${host}`;
    } else if (kind === "direct") {
      const label = [w.brand, w.model_family, w.reference].filter(Boolean).join(" ");
      a.title = `Open ${label} on ${host}`;
    } else {
      a.title = `Open ${host}`;
    }
    row.appendChild(a);
  } else {
    row.appendChild(span("dealer-action disabled", "No site"));
  }

  // WhatsApp
  if (d.whatsapp_url) {
    const a = document.createElement("a");
    a.className = "dealer-action";
    a.href = d.whatsapp_url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "WhatsApp";
    row.appendChild(a);
  } else if (d.email) {
    const a = document.createElement("a");
    a.className = "dealer-action";
    a.href = `mailto:${d.email}`;
    a.textContent = "Email";
    row.appendChild(a);
  } else {
    row.appendChild(span("dealer-action disabled", "—"));
  }

  // Forums
  const forums = document.createElement("div");
  forums.className = "dealer-forums";
  for (const code of d.forum_codes || []) {
    const b = document.createElement("span");
    b.className = "forum-badge";
    b.textContent = FORUM_LABEL[code] || code;
    forums.appendChild(b);
  }
  row.appendChild(forums);
  return row;
}

function renderNoMatch(query) {
  const wrap = document.createElement("div");
  wrap.className = "no-match";
  const h = document.createElement("h3");
  h.textContent = "No matches in the database.";
  wrap.appendChild(h);
  const tk = document.createElement("div");
  tk.className = "tokens";
  tk.textContent = `Tokenized as: [${tokenize(query).join(", ") || "—"}]`;
  wrap.appendChild(tk);

  // Suggest 3 brands by token similarity (any shared token).
  const qTokens = new Set(tokenize(query));
  const brandHits = state.brands
    .map((b) => {
      const toks = new Set(tokenize(b.brand));
      let s = 0;
      for (const t of qTokens) if (toks.has(t)) s++;
      return { brand: b.brand, count: b.count, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.count - a.count);

  const suggestions = document.createElement("div");
  suggestions.className = "suggestions";

  const lead = document.createElement("div");
  lead.style.fontSize = "13px";
  lead.style.marginTop = "10px";
  lead.style.color = "var(--fg-mute)";
  lead.textContent = brandHits.length
    ? "Try a related brand:"
    : "Try one of these brands:";
  wrap.appendChild(lead);

  const fallback = brandHits.length ? brandHits.slice(0, 3) : state.brands.slice(0, 3);
  for (const b of fallback) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = `${b.brand} (${b.count})`;
    pill.addEventListener("click", () => {
      $("#q").value = b.brand;
      runSearch();
    });
    suggestions.appendChild(pill);
  }
  wrap.appendChild(suggestions);

  // Wiki fallback link
  const wiki = document.createElement("div");
  wiki.style.fontSize = "12px";
  wiki.style.marginTop = "12px";
  wiki.style.color = "var(--fg-dim)";
  wiki.innerHTML = 'Or look it up manually on the <a href="https://www.reddit.com/r/RepTime/wiki/index/" target="_blank" rel="noopener">r/RepTime wiki</a>.';
  wrap.appendChild(wiki);

  return wrap;
}

// ============================================================================
// Modal (factory / glossary detail)
// ============================================================================

function renderFactoryDetail(factoryCode) {
  const info = state.factoryInfo.get(factoryCode) ||
               state.factoryInfo.get(factoryCode.split(/\s+/)[0]) ||
               { display: factoryCode };
  const body = $("#factory-detail-body");
  body.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = info.display || factoryCode;
  body.appendChild(h);

  if (info.specialty) {
    appendKv(body, "Specialty", info.specialty);
  }
  if (info.description) {
    appendKv(body, "Description", info.description);
  }

  let rank1 = 0;
  let total = 0;
  for (const w of state.watches) {
    for (const r of w.recommendations) {
      if (r.factory === factoryCode) {
        total++;
        if (r.rank === 1) rank1++;
      }
    }
  }
  if (total > 0) {
    appendKv(body, "In this database",
      `Recommended for ${total} watch${total === 1 ? "" : "es"}` +
      (rank1 > 0 ? ` (top pick for ${rank1})` : ""));
  } else {
    appendKv(body, "In this database", "Not currently recommended in any entry.");
  }

  const wLabel = document.createElement("div");
  wLabel.className = "section-label";
  wLabel.style.marginTop = "24px";
  wLabel.textContent = "Best Watches from this Factory";
  body.appendChild(wLabel);

  const fGrid = document.createElement("div");
  fGrid.className = "results";

  const fWatches = state.watches.filter(w => {
    return w.recommendations.some(r => r.factory === factoryCode && r.rank === 1);
  });

  if (fWatches.length === 0) {
    const empty = document.createElement("p");
    empty.style.color = "var(--fg-dim)";
    empty.style.fontSize = "12px";
    empty.textContent = "No watches in our DB currently recommend this factory as the top pick.";
    fGrid.appendChild(empty);
  } else {
    fWatches.forEach(w => fGrid.appendChild(renderCard(w)));
  }
  body.appendChild(fGrid);
}

function renderDealerDetail(d) {
  const body = $("#dealer-detail-body");
  body.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = d.name;
  body.appendChild(h);

  if (d.notes) {
    appendKv(body, "Notes", d.notes);
  }

  const forums = (d.forum_codes || []).map(c => FORUM_LABEL[c] || c).join(", ");
  if (forums) {
    appendKv(body, "Trusted By", forums);
  }

  const linkWrapper = document.createElement("div");
  linkWrapper.style.marginTop = "16px";
  const a = document.createElement("a");
  a.className = "dealer-action";
  a.href = d.website_url || "#";
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Visit Website";
  a.style.display = "inline-block";
  a.style.padding = "8px 12px";
  a.style.border = "1px solid var(--line)";
  a.style.textDecoration = "none";
  linkWrapper.appendChild(a);
  body.appendChild(linkWrapper);

  const invLabel = document.createElement("div");
  invLabel.className = "section-label";
  invLabel.style.marginTop = "24px";
  invLabel.textContent = "Their Inventory in our DB";
  body.appendChild(invLabel);

  const grid = document.createElement("div");
  grid.className = "results";

  const inventoryWatches = state.watches.filter(w => {
    return state.dealerCatalog?.offers?.[w.id]?.[d.id]?.in_stock;
  });

  if (inventoryWatches.length === 0) {
    const empty = document.createElement("p");
    empty.style.color = "var(--fg-dim)";
    empty.style.fontSize = "12px";
    empty.textContent = "No catalog data found for this dealer yet.";
    grid.appendChild(empty);
  } else {
    inventoryWatches.forEach(w => grid.appendChild(renderCard(w)));
  }
  body.appendChild(grid);
}

function renderAboutPage() {
  const body = $("#about-page-body");
  body.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = "About RepTime Lookup";
  body.appendChild(h);

  const p = document.createElement("p");
  p.style.lineHeight = "1.6";
  p.style.marginTop = "16px";
  p.innerHTML = `
    This tool provides a rapid, offline-capable search interface over the 
    <a href="https://reptime.help" target="_blank" rel="noopener">reptime.help</a> and 
    r/RepTime "Who Makes the Best" consensus guides. 
    <br><br>
    Version 2 includes integrated pricing and stock checks via direct catalog ingestion from Trusted Dealers.
  `;
  body.appendChild(p);
}

function renderComparePage(ids) {
  const root = $("#compare-view-body");
  root.innerHTML = "";

  const watches = ids.map(id => state.watchById.get(id)).filter(Boolean);
  if (!watches.length) {
    root.textContent = "No valid watches selected for comparison.";
    return;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginTop = "16px";

  const tHead = document.createElement("thead");
  const trHead = document.createElement("tr");
  const thProps = document.createElement("th");
  thProps.style.borderBottom = "1px solid var(--line)";
  thProps.style.padding = "8px";
  thProps.style.textAlign = "left";
  thProps.style.width = "120px";
  thProps.textContent = "Property";
  trHead.appendChild(thProps);

  watches.forEach(w => {
    const th = document.createElement("th");
    th.style.borderBottom = "1px solid var(--line)";
    th.style.padding = "8px";
    th.style.textAlign = "left";
    th.style.width = \`\${100 / watches.length}%\`;
    const a = document.createElement("a");
    a.href = \`#watch/\${encodeURIComponent(w.id)}\`;
    a.textContent = w.reference || w.model_family;
    th.appendChild(a);
    trHead.appendChild(th);
  });
  tHead.appendChild(trHead);
  table.appendChild(tHead);

  const tBody = document.createElement("tbody");

  const addRow = (label, renderFn) => {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.className = "section-label";
    tdLabel.style.borderBottom = "1px solid var(--line)";
    tdLabel.style.padding = "12px 8px";
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);

    watches.forEach(w => {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid var(--line)";
      td.style.padding = "12px 8px";
      td.style.verticalAlign = "top";
      const content = renderFn(w);
      if (typeof content === "string") {
        td.innerHTML = content;
      } else if (content) {
        td.appendChild(content);
      } else {
        td.textContent = "—";
      }
      tr.appendChild(td);
    });
    tBody.appendChild(tr);
  };

  addRow("Image", w => {
    const imgUrl = watchImageUrl(w);
    const slot = buildImageSlot(imgUrl, w.brand, "");
    slot.style.width = "120px";
    slot.style.height = "90px";
    return slot;
  });

  addRow("Brand", w => w.brand);
  addRow("Family", w => w.model_family);
  addRow("Reference", w => w.reference);
  addRow("Movement", w => w.movement);

  addRow("Lowest Price", w => {
    const lp = getLowestPrice(w);
    if (!lp) return "Unknown";
    const pb = formatPriceBlock(lp.price, lp.currency, lp.scrapedAt);
    return pb;
  });

  addRow("Best Factory", w => {
    if (!w.recommendations.length) return "None";
    const best = w.recommendations[0];
    const div = document.createElement("div");
    if (best.tier) {
      div.appendChild(tierPill(best.tier));
      const br = document.createElement("br");
      div.appendChild(br);
    }
    const a = document.createElement("a");
    a.href = \`#factory/\${encodeURIComponent(best.factory)}\`;
    a.textContent = best.factory;
    div.appendChild(a);
    return div;
  });

  table.appendChild(tBody);
  root.appendChild(table);
}

function appendKv(parent, label, value) {
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label;
  parent.appendChild(l);
  const p = document.createElement("p");
  p.textContent = value;
  parent.appendChild(p);
}

// ============================================================================
// DOM helpers
// ============================================================================

function span(cls, t) {
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = t;
  return el;
}

function text(t) {
  return document.createTextNode(t);
}

function tierPill(tier) {
  const cls = TIER_CLASS[tier] || "none";
  return span(`tier ${cls}`, tier);
}

function bestTierLabel(w) {
  let best = null;
  for (const r of w.recommendations) {
    if ((TIER_RANK[r.tier] || 0) > (TIER_RANK[best] || 0)) best = r.tier;
  }
  return best;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ============================================================================
// Watch Detail View
// ============================================================================

function renderWatchDetail(w) {
  const root = $("#watch-detail-body");
  root.innerHTML = "";

  const backLink = $("#watch-back-link");
  backLink.href = `#family/${encodeURIComponent(slugify(w.brand) + "--" + slugify(w.model_family))}`;

  // Header / Hero Strip
  const hero = document.createElement("div");
  hero.className = "family-hero";
  
  // Image
  const imgUrl = watchImageUrl(w);
  hero.appendChild(buildImageSlot(imgUrl, w.brand || "—", "family-hero-img"));
  
  const textContainer = document.createElement("div");
  textContainer.className = "family-hero-text";

  const brandLine = document.createElement("h2");
  brandLine.innerHTML = `${escape(w.brand)} <span class="sep">//</span> ${escape(w.model_family)}`;
  textContainer.appendChild(brandLine);

  const watchTitle = document.createElement("div");
  watchTitle.className = "family-hero-name";
  watchTitle.style.fontSize = "18px";
  watchTitle.style.marginTop = "8px";
  watchTitle.innerHTML = `${escape(w.reference || "")} · <span style="color:var(--fg-mute)">${escape(w.movement || "")}</span>`;
  textContainer.appendChild(watchTitle);

  if (w.recommendations.length > 0) {
    const bestRec = w.recommendations[0];
    const recLine = document.createElement("div");
    recLine.style.marginTop = "12px";
    if (bestRec.tier) recLine.appendChild(tierPill(bestRec.tier));
    recLine.appendChild(span("factory-name", ` Best factory: ${bestRec.factory}`));
    textContainer.appendChild(recLine);
  }
  hero.appendChild(textContainer);
  root.appendChild(hero);

  // Offers Section
  const oLabel = document.createElement("div");
  oLabel.className = "section-label";
  oLabel.style.marginTop = "24px";
  oLabel.textContent = "Trusted Dealer Offers";
  root.appendChild(oLabel);

  const offersWrap = document.createElement("div");
  offersWrap.className = "dealers";

  const catalogOffers = state.dealerCatalog?.offers?.[w.id];
  let renderedOffers = 0;
  if (catalogOffers && Object.keys(catalogOffers).length > 0) {
    const dIds = Object.keys(catalogOffers).sort((a,b) => (catalogOffers[a].price || 0) - (catalogOffers[b].price || 0));
    for (const dId of dIds) {
      const o = catalogOffers[dId];
      const d = state.dealers.find(x => x.id === dId);
      if (!d) continue;

      const row = document.createElement("div");
      row.className = "dealer-row";
      
      const rankSpan = span("rank", `#${renderedOffers + 1}`);
      row.appendChild(rankSpan);

      const nameCol = document.createElement("a");
      nameCol.className = "dealer-name";
      nameCol.href = `#dealer/${encodeURIComponent(d.id)}`;
      nameCol.textContent = d.name;
      
      const subtitle = document.createElement("div");
      subtitle.style.marginTop = "4px";
      subtitle.appendChild(formatPriceBlock(o.price, o.currency, o.scraped_at));
      
      if (o.in_stock) {
        const stock = document.createElement("div");
        stock.style.fontSize = "11px";
        stock.style.color = "var(--super-rep)";
        stock.style.marginTop = "4px";
        stock.textContent = "[ IN STOCK ]";
        subtitle.appendChild(stock);
      }
      nameCol.appendChild(subtitle);
      
      row.appendChild(nameCol);

      const a = document.createElement("a");
      a.className = "dealer-action";
      a.href = o.url || d.website_url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "View on site";
      row.appendChild(a);

      const forums = document.createElement("div");
      forums.className = "dealer-forums";
      for (const code of d.forum_codes || []) {
        const b = document.createElement("span");
        b.className = "forum-badge";
        b.textContent = FORUM_LABEL[code] || code;
        forums.appendChild(b);
      }
      row.appendChild(forums);

      offersWrap.appendChild(row);
      renderedOffers++;
    }
  }

  if (renderedOffers === 0) {
    const noData = document.createElement("p");
    noData.className = "dealers-note";
    noData.textContent = "No dealer offers in catalog. Fall back to search on trusted dealers.";
    offersWrap.appendChild(noData);
    offersWrap.appendChild(renderDealers(w));
  }
  
  root.appendChild(offersWrap);

  // Factory alternatives
  const fLabel = document.createElement("div");
  fLabel.className = "section-label";
  fLabel.style.marginTop = "24px";
  fLabel.textContent = "Factory Alternatives";
  root.appendChild(fLabel);
  root.appendChild(renderFactories(w));

  // Notes
  if (w.notes) {
    const nLabel = document.createElement("div");
    nLabel.className = "section-label";
    nLabel.style.marginTop = "24px";
    nLabel.textContent = "Notes";
    root.appendChild(nLabel);
    
    const notes = document.createElement("div");
    notes.className = "notes-box";
    notes.textContent = w.notes;
    root.appendChild(notes);
  }
}
