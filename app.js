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
  brandFilter: "all",  // current filter on browse grid
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
  const [guide, reptime, images] = await Promise.all([
    fetchJson(DATA_PATHS.guide),
    fetchJson(DATA_PATHS.reptime),
    fetchJsonOptional(DATA_PATHS.images),
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
  state.loaded = true;

  renderStats();
  wireSearch();
  wireModal();
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
    return { ...d, forum_codes: forumCodes, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || "").localeCompare(b.name || "");
  });
  return scored;
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

// ----- Routing -------------------------------------------------------------
// Hash → view selector. Empty/'#browse' = catalog grid; '#family/<id>' =
// family detail; otherwise the search-input value drives results.
function getRoute() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h || h === "browse") return { view: "browse" };
  const m = h.match(/^family\/(.+)$/);
  if (m) return { view: "family", id: decodeURIComponent(m[1]) };
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

  // A non-empty search query overrides whatever route we're on.
  if (q) {
    results.hidden = false;
    browse.hidden = true;
    detail.hidden = true;
    runSearch();
    return;
  }

  results.innerHTML = "";
  results.hidden = true;
  $("#count").textContent = "";

  if (route.view === "family") {
    const fam = state.familyById.get(route.id);
    if (!fam) {
      // Unknown id — fall back to browse and clean the hash.
      window.location.hash = "browse";
      return;
    }
    browse.hidden = true;
    detail.hidden = false;
    renderFamilyDetail(fam);
  } else {
    detail.hidden = true;
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

  const hits = search(q);
  if (!hits.length) {
    count.textContent = "0 matches";
    resultsEl.appendChild(renderNoMatch(q));
    return;
  }

  const top = hits.slice(0, MAX_RESULTS);
  count.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"}`;

  const autoExpandTop = top.length > 1 && top[0].score >= top[1].score * 2;
  top.forEach((hit, i) => {
    const card = renderCard(hit.watch, autoExpandTop && i === 0);
    resultsEl.appendChild(card);
  });
}

// ============================================================================
// Browse view (family grid + detail)
// ============================================================================

/** Look up an image for a family. Chain: family-id → brand-slug → null. */
function familyImageUrl(fam) {
  if (state.images[fam.id]) return state.images[fam.id];
  const brandKey = slugify(fam.brand);
  if (state.images[brandKey]) return state.images[brandKey];
  return null;
}

/** Look up an image for a single watch.
 *  Chain: watch-id → family-id → brand-slug → null. Most specific wins.
 */
function watchImageUrl(w) {
  if (state.images[w.id]) return state.images[w.id];
  const famId = `${slugify(w.brand)}--${slugify(w.model_family)}`;
  if (state.images[famId]) return state.images[famId];
  const brandKey = slugify(w.brand);
  if (state.images[brandKey]) return state.images[brandKey];
  return null;
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
  const allChip = makeBrandChip("all", "All", state.families.length);
  chipBox.appendChild(allChip);
  for (const { brand, count } of state.brands) {
    chipBox.appendChild(makeBrandChip(brand, brand, undefined, count));
  }
  updateChipActiveState();

  // Family grid
  const grid = $("#family-grid");
  grid.innerHTML = "";
  const filter = state.brandFilter;
  const families = filter === "all"
    ? state.families
    : state.families.filter((f) => f.brand === filter);

  if (!families.length) {
    const empty = document.createElement("div");
    empty.className = "browse-empty";
    empty.textContent = "No families match this filter.";
    grid.appendChild(empty);
    return;
  }
  for (const fam of families) grid.appendChild(renderFamilyCard(fam));
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
    const grid = $("#family-grid");
    grid.innerHTML = "";
    const families = value === "all"
      ? state.families
      : state.families.filter((f) => f.brand === value);
    for (const fam of families) grid.appendChild(renderFamilyCard(fam));
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

  // Variants list — reuse renderCard, expand the first if there's only one.
  const variantsLabel = document.createElement("div");
  variantsLabel.className = "section-label";
  variantsLabel.style.margin = "20px 0 10px";
  variantsLabel.textContent =
    fam.variant_count === 1 ? "Recommendation" : "Variants";
  root.appendChild(variantsLabel);

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
  const card = document.createElement("article");
  card.className = "card" + (w.legacy ? " legacy" : "");
  if (expanded) card.setAttribute("open", "");
  card.dataset.id = w.id;

  // Head
  const head = document.createElement("div");
  head.className = "card-head";
  head.tabIndex = 0;
  head.role = "button";
  head.setAttribute("aria-expanded", expanded ? "true" : "false");

  // Image slot (left of head). Falls back through watch → family → brand → null.
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

  head.appendChild(titleWrap);

  const headRight = document.createElement("div");
  headRight.className = "card-head-right";
  const topTier = bestTierLabel(w);
  if (topTier) headRight.appendChild(tierPill(topTier));
  const chev = document.createElement("span");
  chev.className = "chev";
  headRight.appendChild(chev);
  head.appendChild(headRight);

  head.addEventListener("click", () => toggleCard(card));
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard(card);
    }
  });
  card.appendChild(head);

  // Body
  const body = document.createElement("div");
  body.className = "card-body";

  // Factories
  const facLabel = document.createElement("div");
  facLabel.className = "section-label";
  facLabel.textContent = "Best factory";
  body.appendChild(facLabel);
  body.appendChild(renderFactories(w));

  // Dealers
  const dlrLabel = document.createElement("div");
  dlrLabel.className = "section-label";
  dlrLabel.style.marginTop = "18px";
  dlrLabel.textContent = "Top trusted dealers";
  body.appendChild(dlrLabel);
  body.appendChild(renderDealers());

  // Notes
  if (w.notes) {
    const notes = document.createElement("div");
    notes.className = "notes-box";
    notes.textContent = w.notes;
    body.appendChild(notes);
  }

  card.appendChild(body);
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

  const name = document.createElement("span");
  name.className = "factory-name";
  name.textContent = r.factory;
  name.title = "View factory info";
  name.addEventListener("click", () => showFactoryModal(r.factory));
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

function renderDealers() {
  const wrap = document.createElement("div");
  wrap.className = "dealers";

  const note = document.createElement("p");
  note.className = "dealers-note";
  note.textContent = "Any TD can source any watch currently in production. Top picks are ranked by forum-vetting score.";
  wrap.appendChild(note);

  const top = state.dealers.slice(0, MAX_DEALERS_DEFAULT);
  for (let i = 0; i < top.length; i++) wrap.appendChild(renderDealerRow(top[i], i + 1));

  if (state.dealers.length > MAX_DEALERS_DEFAULT) {
    const more = document.createElement("button");
    more.className = "show-more";
    more.textContent = `Show all ${state.dealers.length} trusted dealers`;
    more.addEventListener("click", () => {
      more.remove();
      const rest = state.dealers.slice(MAX_DEALERS_DEFAULT);
      rest.forEach((d, idx) => wrap.appendChild(renderDealerRow(d, MAX_DEALERS_DEFAULT + idx + 1)));
    });
    wrap.appendChild(more);
  }
  return wrap;
}

function renderDealerRow(d, rank) {
  const row = document.createElement("div");
  row.className = "dealer-row";

  row.appendChild(span("rank", `#${rank}`));

  const name = document.createElement("div");
  name.className = "dealer-name";
  name.textContent = d.name;
  if (d.notes) {
    const small = document.createElement("div");
    small.style.fontSize = "12px";
    small.style.color = "var(--fg-dim)";
    small.textContent = d.notes;
    name.appendChild(small);
  }
  row.appendChild(name);

  // Website
  if (d.website_url) {
    const a = document.createElement("a");
    a.className = "dealer-action";
    a.href = d.website_url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Website";
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

function wireModal() {
  const modal = $("#modal");
  modal.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.close !== undefined) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function showFactoryModal(factoryCode) {
  const info = state.factoryInfo.get(factoryCode) ||
               state.factoryInfo.get(factoryCode.split(/\s+/)[0]) ||
               { display: factoryCode };
  const body = $("#modal-body");
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

  // Stats: how many watches in our DB list this factory at rank 1?
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

  $("#modal").hidden = false;
}

function closeModal() {
  $("#modal").hidden = true;
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
