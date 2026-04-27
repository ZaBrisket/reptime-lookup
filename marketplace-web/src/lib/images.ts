import { WatchRecord, FamilyRecord, AppState } from "./types";
import { slugify } from "./utils";

export function watchImageUrl(w: WatchRecord, state: AppState): string | null {
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

export function familyImageUrl(fam: FamilyRecord, state: AppState): string | null {
  if (state.images[fam.id]) return state.images[fam.id];
  for (const w of fam.variants) {
    const offers = state.dealerCatalog?.offers?.[w.id] || {};
    for (const d of state.dealers) {
      const offer = offers[d.id];
      if (offer && offer.images && offer.images.length > 0) return offer.images[0];
    }
  }
  const brandKey = slugify(fam.brand);
  if (state.images[brandKey]) return state.images[brandKey];
  return null;
}
