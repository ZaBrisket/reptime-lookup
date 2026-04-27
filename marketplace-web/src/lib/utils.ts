import { WatchRecord, AppState, DealerRecord, TIER_RANK } from "./types";

export function tokenize(s: string | null | undefined): string[] {
  if (s == null) return [];
  return String(s)
    .toLowerCase()
    .split(/[\s,\/\-()[\]{}]+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));
}

export function slugify(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function bestTierRank(w: WatchRecord): number {
  let best = 0;
  for (const r of w.recommendations) {
    const t = TIER_RANK[r.tier || ""] || 0;
    if (t > best) best = t;
  }
  return best;
}

export function getLowestPrice(w: WatchRecord, state: AppState): { price: number; currency: string } | null {
  let best: { price: number; currency: string } | null = null;
  const offers = state.dealerCatalog.offers?.[w.id];
  if (offers) {
    for (const d of Object.values(offers)) {
      if (d.price != null && (!best || d.price < best.price)) {
        best = { price: d.price, currency: d.currency || "USD" };
      }
    }
  }
  return best;
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

export function dealerLinkForWatch(dealer: DealerRecord, w: WatchRecord, state: AppState) {
  if (!dealer || !dealer.id) {
    return { url: dealer && dealer.website_url ? dealer.website_url : "", kind: "home" };
  }
  const offer = state.dealerCatalog?.offers?.[w.id]?.[dealer.id];
  if (offer && offer.url) {
    return { url: offer.url, kind: "direct", offer };
  }
  const direct = state.dealerDeepLinks?.[w.id]?.[dealer.id];
  if (direct) return { url: direct, kind: "direct" };

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
  return { url: dealer.website_url || "", kind: "home" };
}
