"use client";

import { SearchIcon, XIcon } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { useRouter } from 'next/navigation';
import { WatchRecord } from '@/lib/types';

export function WatchSearch({ watches }: { watches: WatchRecord[] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WatchRecord[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fuse = new Fuse(watches, {
    keys: ['brand', 'model_family', 'reference', 'search_tokens'],
    threshold: 0.3,
  });

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    const res = fuse.search(query).map((r) => r.item);
    setResults(res.slice(0, 5));
  }, [query, fuse]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (watch: WatchRecord) => {
    setIsFocused(false);
    setQuery('');
    router.push(`/?q=${encodeURIComponent(watch.brand + ' ' + watch.model_family + ' ' + (watch.reference || ''))}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsFocused(false);
    if (query) {
      router.push(`/?q=${encodeURIComponent(query)}`);
      setQuery('');
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <form onSubmit={handleSearchSubmit} className="relative flex items-center border-b border-line">
        <SearchIcon className="absolute left-2 w-4 h-4 opacity-50" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="e.g. Rolex Submariner"
          className="w-full bg-transparent text-ink placeholder:text-ink/30 pl-8 pr-8 py-2 focus:outline-none text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-2 opacity-50 hover:opacity-100"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </form>

      {isFocused && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-bg border-2 border-line shadow-[4px_4px_0px_var(--color-line)] z-50 max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            results.map((watch, i) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-ink hover:text-bg transition-colors border-b border-line last:border-0 flex flex-col items-start gap-1"
                onClick={() => handleSelect(watch)}
              >
                <div className="font-bold text-sm">
                  {watch.brand} <span className="font-normal opacity-80">{watch.model_family}</span>
                </div>
                <div className="text-[10px] font-mono opacity-60 flex items-center gap-2">
                  <span className="">{watch.reference}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center opacity-60 text-[10px] font-mono uppercase">
              Press enter to search for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
