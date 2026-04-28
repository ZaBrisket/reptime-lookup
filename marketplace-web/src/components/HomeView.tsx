"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppState, WatchRecord } from "@/lib/types";
import { tokenize, bestTierRank, getLowestPrice } from "@/lib/utils";
import { watchImageUrl } from "@/lib/images";
import Link from "next/link";
import { ArrowRightIcon, WatchIcon, ArrowLeftIcon } from "lucide-react";

export default function HomeView({ state }: { state: AppState }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const query = searchParams.get("q") || "";
  const [filterBrand, setFilterBrand] = useState<string | null>(null);

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

  // Group watches by brand for the catalog
  const groupedWatches = useMemo(() => {
    const groups: Record<string, WatchRecord[]> = {};
    state.watches.forEach(w => {
      if (!groups[w.brand]) groups[w.brand] = [];
      const isDuplicate = groups[w.brand].some(existing => existing.reference === w.reference);
      if (!isDuplicate) {
        groups[w.brand].push(w);
      }
    });
    return groups;
  }, [state.watches]);

  const brands = Object.keys(groupedWatches).sort();

  const clearSearch = () => {
    router.push('/');
  };

  return (
    <div className="w-full flex-1">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 shrink-0 gap-4">
        <h2 className="text-4xl font-bold tracking-tighter uppercase sm:pt-0 pt-4">
          {query ? "QUERY RESULTS" : "WATCH CATALOG"}
        </h2>
        <div className="flex gap-4">
          <div className="sm:text-right text-left">
            <div className="text-[10px] font-mono">QUERY PARAMETER:</div>
            <div className="text-sm font-bold uppercase truncate max-w-xs cursor-pointer hover:underline border-b border-line" onClick={clearSearch}>
              {query ? `"${query}"` : "CATALOG BROWSING ENGINES ENGAGED"}
            </div>
          </div>
        </div>
      </div>

      {!query ? (
        <div className="w-full space-y-8 animate-in fade-in duration-500">
          {/* Brand Filter */}
          <div className="flex flex-wrap gap-2 mb-8 border-b-2 border-line pb-6">
            <button
              onClick={() => setFilterBrand(null)}
              className={`px-3 py-1 text-xs font-mono uppercase border border-line transition-colors ${
                filterBrand === null ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-ink/10'
              }`}
            >
              ALL BRANDS
            </button>
            {brands.map(brand => (
              <button
                key={brand}
                onClick={() => setFilterBrand(brand)}
                className={`px-3 py-1 text-xs font-mono uppercase border border-line transition-colors ${
                  filterBrand === brand ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-ink/10'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>

          {/* Catalog Render */}
          {brands
            .filter(brand => filterBrand === null || filterBrand === brand)
            .map(brand => (
            <section key={brand} className="mb-12">
              <h3 className="text-2xl font-serif italic mb-6 text-ink">{brand}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {groupedWatches[brand].map((w, i) => {
                  const imgUrl = watchImageUrl(w, state);
                  return (
                  <Link 
                    href={`/watch/${w.id}`}
                    key={`${w.reference}-${i}`}
                    className="group flex flex-col bg-white border-2 border-line hover:shadow-[4px_4px_0px_var(--color-line)] transition-all overflow-hidden relative"
                  >
                    <div className="aspect-square bg-[#F7F7F5] flex items-center justify-center border-b-2 border-line relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/5 mix-blend-multiply transition-opacity group-hover:opacity-50"></div>
                      
                      {imgUrl ? (
                        <img src={imgUrl} alt={w.model_family} className="w-full h-full object-contain p-4 mix-blend-multiply group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-20 h-20 rounded-full border-4 border-line/10 flex items-center justify-center bg-white/50 shadow-inner group-hover:scale-110 transition-transform duration-500">
                          <WatchIcon className="w-8 h-8 text-line/40 group-hover:text-line/80 transition-colors duration-500" strokeWidth={1.5} />
                        </div>
                      )}
                      
                      {!imgUrl && (
                        <div className="absolute bottom-2 right-2 text-[8px] font-mono text-line/40 uppercase font-bold tracking-widest">
                          IMAGE PENDING
                        </div>
                      )}

                      {w.recommendations && w.recommendations[0]?.tier && (
                        <div className="absolute top-2 left-2 bg-emerald-50 text-emerald-800 border border-emerald-800/30 px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase shadow-sm">
                          {w.recommendations[0].tier}
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4 flex flex-col grow">
                      <div className="text-[9px] text-ink/60 uppercase tracking-widest font-bold mb-1 line-clamp-1">
                        {w.brand}
                      </div>
                      <div className="font-bold text-sm text-ink mb-1 leading-tight line-clamp-2">
                        {w.model_family}
                      </div>
                      <div className="text-[10px] font-mono opacity-80 mt-auto pt-3 border-t border-dashed border-line/20 flex items-center justify-between">
                        <span className="truncate pr-2">{w.reference}</span>
                        <ArrowRightIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300" />
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto w-full animate-in fade-in">
          <button 
            onClick={clearSearch}
            className="flex items-center gap-2 mb-8 text-xs font-mono uppercase tracking-widest hover:underline opacity-60 hover:opacity-100"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back to Catalog
          </button>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchResults?.map(w => {
                const imgUrl = watchImageUrl(w, state);
                return (
                <Link 
                  href={`/watch/${w.id}`}
                  key={w.id}
                  className="flex flex-col bg-white border-2 border-line hover:shadow-[4px_4px_0px_var(--color-line)] transition-all overflow-hidden"
                >
                  <div className="p-4 bg-surface-2 border-b-2 border-line flex items-center gap-4">
                     <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center shrink-0 border border-line overflow-hidden">
                       {imgUrl ? (
                         <img src={imgUrl} alt={w.model_family} className="w-full h-full object-contain mix-blend-multiply" />
                       ) : (
                         <WatchIcon className="w-6 h-6 text-line/50" />
                       )}
                     </div>
                     <div>
                       <div className="text-[10px] font-mono opacity-60">{w.brand}</div>
                       <div className="font-bold text-sm leading-tight">{w.model_family}</div>
                       <div className="text-xs font-mono mt-1 opacity-80">{w.reference}</div>
                     </div>
                  </div>
                  <div className="p-4 space-y-4 text-xs font-sans">
                     {w.recommendations && w.recommendations.map((rec, i) => (
                        <div key={i} className="flex justify-between items-center border-b border-line/10 pb-2 last:border-0">
                           <div>
                             <div className="font-bold">{rec.factory}</div>
                           </div>
                           <div className="text-right">
                             <div className="font-mono bg-line text-white px-2 py-0.5 inline-block text-[10px]">{rec.tier}</div>
                           </div>
                        </div>
                     ))}
                  </div>
                </div>
                );
             })}
             {searchResults?.length === 0 && (
               <div className="col-span-full py-12 text-center border-2 border-dashed border-line/30">
                  <div className="text-sm font-mono opacity-50 uppercase">No Matches Found</div>
               </div>
             )}
          </div>
        </div>
      )}

      <footer className="mt-8 pt-4 border-t border-line flex flex-col sm:flex-row sm:justify-between sm:items-center text-[10px] font-mono shrink-0 gap-2 sm:gap-0 hidden md:flex">
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <span>ENGINE: v2.0-STABLE</span>
          <span>RESOURCES: {state.watches.length} M, {state.dealers.length} TD</span>
        </div>
        <div className="opacity-50 sm:opacity-100">SYSTEM OPERATIONAL // {query ? "RESULTS DELIVERED" : "READY FOR NEXT QUERY"}</div>
      </footer>
    </div>
  );
}
