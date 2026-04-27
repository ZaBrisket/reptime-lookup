"use client";

import { useState, useMemo } from "react";
import { AppState, WatchRecord, FamilyRecord } from "@/lib/types";
import { tokenize, bestTierRank, getLowestPrice } from "@/lib/utils";
import WatchCard from "@/components/WatchCard";
import FamilyCard from "@/components/FamilyCard";

export default function HomeView({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterSort, setFilterSort] = useState("relevance");
  const [filterInStock, setFilterInStock] = useState(false);
  const [filterPriceMin, setFilterPriceMin] = useState<number | null>(null);
  const [filterPriceMax, setFilterPriceMax] = useState<number | null>(null);

  const searchResults = useMemo(() => {
    if (!query) return null;
    const tokens = tokenize(query);
    if (!tokens.length) return null;

    const results: { watch: WatchRecord; score: number }[] = [];
    for (const w of state.watches) {
      let score = 0;
      const tokSet = new Set(w.search_tokens);
      for (const qt of tokens) {
        if (tokSet.has(qt)) {
          score += 5;
        } else {
          for (const wt of w.search_tokens) {
            if (wt.includes(qt) && qt.length >= 3) {
              score += 3;
              break;
            }
          }
        }
      }
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

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = bestTierRank(a.watch);
      const tb = bestTierRank(b.watch);
      if (tb !== ta) return tb - ta;
      return (a.watch.brand || "").localeCompare(b.watch.brand || "") ||
             (a.watch.model_family || "").localeCompare(b.watch.model_family || "");
    });

    return results.map((r) => r.watch);
  }, [query, state.watches]);

  const watchPassesFilters = (w: WatchRecord) => {
    if (filterInStock) {
      const offers = state.dealerCatalog?.offers?.[w.id];
      let hasStock = false;
      if (offers) {
        for (const d of Object.values(offers)) {
          if (d && d.in_stock) { hasStock = true; break; }
        }
      }
      if (!hasStock) return false;
    }
    if (filterPriceMin != null || filterPriceMax != null) {
      const lp = getLowestPrice(w, state);
      if (!lp) return false;
      if (filterPriceMin != null && lp.price < filterPriceMin) return false;
      if (filterPriceMax != null && lp.price > filterPriceMax) return false;
    }
    return true;
  };

  const displayedWatches = useMemo(() => {
    if (!searchResults) return [];
    let res = searchResults.filter(watchPassesFilters);
    
    if (filterSort === "price_asc") {
      res.sort((a, b) => {
        const pa = getLowestPrice(a, state)?.price ?? Infinity;
        const pb = getLowestPrice(b, state)?.price ?? Infinity;
        return pa - pb;
      });
    } else if (filterSort === "price_desc") {
      res.sort((a, b) => {
        const pa = getLowestPrice(a, state)?.price ?? 0;
        const pb = getLowestPrice(b, state)?.price ?? 0;
        return pb - pa;
      });
    } else if (filterSort === "rank") {
      res.sort((a, b) => {
        const ta = bestTierRank(a);
        const tb = bestTierRank(b);
        return tb - ta;
      });
    }
    return res;
  }, [searchResults, filterSort, filterInStock, filterPriceMin, filterPriceMax, state]);

  const displayedFamilies = useMemo(() => {
    if (filterBrand === "all") return state.families;
    return state.families.filter((f) => f.brand === filterBrand);
  }, [filterBrand, state.families]);

  return (
    <main className="main">
      <div className="search-row">
        <span className="search-input-wrap">
          <input
            id="q"
            type="search"
            autoComplete="off"
            autoFocus
            placeholder="QUERY: SUBMARINER 116610LN / DAYTONA / PATEK 5167 / PAM 005"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        <span id="count" className="count" aria-live="polite">
          {searchResults ? `${displayedWatches.length} matches` : ""}
        </span>
      </div>

      <div className="layout-main">
        {(query || filterBrand !== "all") && (
          <aside id="filter-sidebar" className="filter-sidebar">
            <div className="filter-group">
              <label className="section-label">Sort By</label>
              <select className="filter-input" value={filterSort} onChange={(e) => setFilterSort(e.target.value)}>
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rank">Forum Rank</option>
              </select>
            </div>
            <div className="filter-group" style={{ marginTop: "16px" }}>
              <label className="section-label">Availability</label>
              <label className="checkbox-label">
                <input type="checkbox" checked={filterInStock} onChange={(e) => setFilterInStock(e.target.checked)} /> In Stock Only
              </label>
            </div>
            <div className="filter-group" style={{ marginTop: "16px" }}>
              <label className="section-label">Price Range</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="number" className="filter-input" placeholder="Min $" style={{ width: "100%" }} value={filterPriceMin || ""} onChange={(e) => setFilterPriceMin(e.target.value ? Number(e.target.value) : null)} />
                <input type="number" className="filter-input" placeholder="Max $" style={{ width: "100%" }} value={filterPriceMax || ""} onChange={(e) => setFilterPriceMax(e.target.value ? Number(e.target.value) : null)} />
              </div>
            </div>
          </aside>
        )}

        <div className="layout-content">
          {query ? (
            <section id="results" className="results">
              {displayedWatches.slice(0, 8).map((w) => (
                <WatchCard key={w.id} w={w} state={state} />
              ))}
              {displayedWatches.length === 0 && (
                <div className="browse-empty" style={{ marginTop: "24px", color: "var(--fg-dim)" }}>
                  No watches match the current filters.
                </div>
              )}
            </section>
          ) : (
            <section id="browse-view" className="browse-view">
              <div className="browse-toolbar">
                <h2 className="browse-title">Browse</h2>
                <div id="brand-chips" className="brand-chips">
                  <button className={`chip ${filterBrand === "all" ? "active" : ""}`} onClick={() => setFilterBrand("all")}>ALL</button>
                  {state.brands.map((b) => (
                    <button key={b.brand} className={`chip ${filterBrand === b.brand ? "active" : ""}`} onClick={() => setFilterBrand(b.brand)}>
                      {b.brand.toUpperCase()} <span className="chip-count">{b.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div id="family-grid" className="family-grid">
                {displayedFamilies.map((fam) => (
                  <FamilyCard key={fam.id} fam={fam} state={state} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
