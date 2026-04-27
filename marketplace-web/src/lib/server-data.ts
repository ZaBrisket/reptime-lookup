import fs from 'fs';
import path from 'path';
import { AppState, WatchRecord, FamilyRecord, DealerRecord, FactoryInfo, FORUM_WEIGHTS, TIER_RANK } from './types';
import { tokenize, slugify } from './utils';

function makeWatchId(brand: string, family: string, ref: string | null): string {
  return [slugify(brand), slugify(family), slugify(ref || "any")]
    .filter(Boolean)
    .join("-");
}

function primarySkuToken(refTokens: string[]): string | null {
  const isUnit = (t: string) => /^\d+(mm|cm|in|ft|kg|hz)$/.test(t);
  const isVersion = (t: string) => /^v\d+$/.test(t);
  const has3Digits = (t: string) => /\d{3,}/.test(t);
  const isJunk = (t: string) => isUnit(t) || isVersion(t);
  const pickLongestThenAlpha = (arr: string[]) =>
    arr.sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
  const mixed = refTokens.filter(
    (t) => /[a-z]/.test(t) && /\d/.test(t) && has3Digits(t) && !isJunk(t)
  );
  if (mixed.length) return pickLongestThenAlpha(mixed.slice());
  const numeric = refTokens.filter((t) => /^\d{3,}$/.test(t));
  if (numeric.length) return pickLongestThenAlpha(numeric.slice());
  return null;
}

function buildUnifiedWatches(guide: any, reptime: any): WatchRecord[] {
  const map = new Map<string, any>();
  const legacyBrands = new Set(
    (guide.brands || []).filter((b: any) => b && b.legacy).map((b: any) => b.brand)
  );
  const BRAND_CANONICAL: Record<string, string> = { "jaegerlecoultre": "Jaeger LeCoultre" };
  const canonicalBrand = (raw: string) => {
    if (!raw) return raw;
    const key = String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
    return BRAND_CANONICAL[key] || raw;
  };
  const str = (v: any) => (v == null ? "" : String(v));

  const ingest = (rec: any, source: string) => {
    const brand = canonicalBrand(str(rec.brand));
    const family = str(rec.model_family);
    const ref = str(rec.model_number ?? rec.reference);
    const refTokens = tokenize(ref);
    const movement = str(rec.movement);
    const movementTokens = tokenize(movement);
    const sku = primarySkuToken(refTokens);
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
      if (!entry.reference) entry.reference = ref;
      else entry.reference_alternatives.push(ref);
    }
    if (!entry.movement && rec.movement) entry.movement = str(rec.movement);
    if (!entry.notes && rec.notes) entry.notes = str(rec.notes);
    entry.sources.add(source);

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
        if ((TIER_RANK[r.tier || ""] || 0) > (TIER_RANK[existing.tier || ""] || 0)) existing.tier = r.tier;
      }
    }
  };

  for (const w of guide.watches || []) ingest(w, "guide");
  for (const w of reptime.who_makes_the_best || []) ingest(w, "reptime");

  const all: WatchRecord[] = [];
  for (const e of map.values()) {
    const recs = Array.from(e._factoryByCode.values()) as any[];
    recs.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return (TIER_RANK[b.tier || ""] || 0) - (TIER_RANK[a.tier || ""] || 0);
    });
    e.recommendations = recs.map((r, i) => ({
      rank: i + 1,
      factory: r.factory,
      tier: r.tier,
      sources: Array.from(r.sources).sort(),
    }));

    const tokens = new Set<string>();
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

    delete e._factoryByCode;
    delete e._refTokens;
    all.push(e);
  }

  const s = (v: any) => String(v == null ? "" : v);
  all.sort((a, b) =>
    s(a.brand).localeCompare(s(b.brand)) ||
    s(a.model_family).localeCompare(s(b.model_family)) ||
    s(a.reference).localeCompare(s(b.reference))
  );
  return all;
}

function buildDealers(reptime: any): DealerRecord[] {
  const list = (reptime.trusted_dealers && reptime.trusted_dealers.dealers) || [];
  const scored = list.map((d: any) => {
    const forumStr = (d.forum || "").toUpperCase();
    const forumCodes = forumStr.split(/\s+/).filter(Boolean);
    const score = forumCodes.reduce(
      (acc: number, c: string) => acc + (FORUM_WEIGHTS[c] || 0),
      0
    );
    return { ...d, id: slugify(d.name), forum_codes: forumCodes, score };
  });
  scored.sort((a: any, b: any) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.name || "").localeCompare(b.name || "");
  });
  return scored;
}

function buildFactoryInfo(reptime: any): Map<string, FactoryInfo> {
  const info = new Map<string, FactoryInfo>();
  const factories = (reptime.factories && reptime.factories.major_factories) || [];
  for (const f of factories) {
    if (!f.factory) continue;
    const fullName = f.factory;
    const codeMatch = fullName.match(/\(([A-Z0-9]+)\)/);
    const baseName = fullName.split(/\s*\(/)[0].trim();
    const entry = { display: fullName, specialty: f.specialty || null, description: null };
    info.set(fullName, entry);
    if (baseName && baseName !== fullName) info.set(baseName, entry);
    if (codeMatch) info.set(codeMatch[1], entry);
  }
  const glossary = reptime.glossary || [];
  for (const cat of glossary) {
    if (cat.category && cat.category.toLowerCase().includes("factor")) {
      for (const t of cat.terms || []) {
        const term = t.term;
        if (!term) continue;
        const hit = info.get(term) || info.get(term.split(/\s*\/\s*/)[0]);
        if (hit) hit.description = t.definition || hit.description;
        if (!info.has(term)) {
          info.set(term, { display: term, specialty: null, description: t.definition || null });
        }
      }
    }
  }
  return info;
}

function buildGlossary(reptime: any): Map<string, any> {
  const map = new Map();
  for (const cat of reptime.glossary || []) {
    for (const t of cat.terms || []) {
      if (t.term) map.set(t.term.toLowerCase(), { ...t, category: cat.category });
    }
  }
  return map;
}

function buildBrandList(watches: WatchRecord[]): { brand: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const w of watches) {
    if (!w.brand) continue;
    counts.set(w.brand, (counts.get(w.brand) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

function buildFamilies(watches: WatchRecord[]): FamilyRecord[] {
  const map = new Map<string, any>();
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
      const cur = fam._topFactoryCounts.get(top.factory) || { count: 0, bestTier: null };
      cur.count++;
      if ((TIER_RANK[top.tier || ""] || 0) > (TIER_RANK[cur.bestTier || ""] || 0)) cur.bestTier = top.tier;
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
         (TIER_RANK[info.bestTier || ""] || 0) > (TIER_RANK[best.tier || ""] || 0))
      ) {
        best = { factory, count: info.count, tier: info.bestTier };
      }
    }
    fam.consensus_best = best;
    fam.variant_count = fam.variants.length;
    delete fam._topFactoryCounts;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
    return a.brand.localeCompare(b.brand) || a.family.localeCompare(b.family);
  });
}

function loadJsonSync(filename: string) {
  const filePath = path.join(process.cwd(), 'src', 'data', filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (filename === 'images.json' || filename === 'dealer-search.json' || filename === 'dealer-deep-links.json' || filename === 'fx-rates.json') {
        return {};
    }
    if (filename === 'dealer-catalog.json') {
        return { offers: {} };
    }
    console.warn(`Could not load ${filename}:`, err);
    return {};
  }
}

let cachedState: AppState | null = null;

export function getData(): AppState {
  if (cachedState) return cachedState;

  const guide = loadJsonSync('who-makes-the-best-guide.json');
  const reptime = loadJsonSync('reptime-help.json');
  const images = loadJsonSync('images.json');
  const dealerSearch = loadJsonSync('dealer-search.json');
  const dealerDeepLinks = loadJsonSync('dealer-deep-links.json');
  const dealerCatalog = loadJsonSync('dealer-catalog.json');
  const fxRates = loadJsonSync('fx-rates.json');

  const watches = buildUnifiedWatches(guide, reptime);
  const watchById = new Map<string, WatchRecord>();
  watches.forEach(w => watchById.set(w.id, w));

  const dealers = buildDealers(reptime);
  const factoryInfo = buildFactoryInfo(reptime);
  const glossary = buildGlossary(reptime);
  const brands = buildBrandList(watches);
  const families = buildFamilies(watches);
  const familyById = new Map<string, FamilyRecord>();
  families.forEach(f => familyById.set(f.id, f));

  cachedState = {
    watches,
    watchById,
    dealers,
    factoryInfo,
    glossary,
    brands,
    families,
    familyById,
    images: images || {},
    dealerSearch: dealerSearch || {},
    dealerDeepLinks: dealerDeepLinks || {},
    dealerCatalog: dealerCatalog && dealerCatalog.offers ? dealerCatalog : { offers: {} },
    fxRates: fxRates || {}
  };

  return cachedState;
}
