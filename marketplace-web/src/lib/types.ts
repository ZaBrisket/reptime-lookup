export const FORUM_WEIGHTS: Record<string, number> = { RWI: 3, REPGEEK: 2, RWG: 1 };
export const TIER_RANK: Record<string, number> = { NWBIG: 2, "Super Rep": 1, null: 0, undefined: 0 };

export interface WatchRecord {
  id: string;
  brand: string;
  model_family: string;
  reference: string | null;
  reference_alternatives: string[];
  movement: string | null;
  legacy: boolean;
  notes: string | null;
  recommendations: { rank: number; factory: string; tier: string | null; sources: string[] }[];
  sources: string[];
  search_tokens: string[];
}

export interface FamilyRecord {
  id: string;
  brand: string;
  family: string;
  legacy: boolean;
  variants: WatchRecord[];
  variant_count: number;
  consensus_best: { factory: string; count: number; tier: string | null } | null;
}

export interface DealerRecord {
  id: string;
  name: string;
  forum_codes: string[];
  score: number;
  website_url?: string;
  [key: string]: any;
}

export interface FactoryInfo {
  display: string;
  specialty: string | null;
  description: string | null;
}

export interface AppState {
  watches: WatchRecord[];
  watchById: Map<string, WatchRecord>;
  dealers: DealerRecord[];
  factoryInfo: Map<string, FactoryInfo>;
  glossary: Map<string, any>;
  brands: { brand: string; count: number }[];
  families: FamilyRecord[];
  familyById: Map<string, FamilyRecord>;
  images: Record<string, string>;
  dealerSearch: Record<string, any>;
  dealerDeepLinks: Record<string, Record<string, string>>;
  dealerCatalog: { offers: Record<string, Record<string, any>> };
  fxRates: Record<string, number>;
}
