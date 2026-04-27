import { getData } from "@/lib/server-data";
import { slugify } from "@/lib/utils";
import { watchImageUrl } from "@/lib/images";
import Link from "next/link";
import DealerOfferCard from "@/components/DealerOfferCard";

export function generateStaticParams() {
  const state = getData();
  return state.watches.map((w) => ({
    id: w.id,
  }));
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = getData();
  const w = state.watchById.get(id);

  if (!w) {
    return <div>Watch not found.</div>;
  }

  const famId = `${slugify(w.brand)}--${slugify(w.model_family)}`;
  const imgUrl = watchImageUrl(w, state);

  // Group and sort dealer offers by rank
  const offersWithDealers = state.dealers.map(d => {
    const offer = state.dealerCatalog?.offers?.[w.id]?.[d.id];
    return { dealer: d, offer };
  }).filter(x => x.offer);
  
  // Sort by price if both have price, otherwise by rank
  offersWithDealers.sort((a, b) => {
    if (a.offer?.price && b.offer?.price) {
      return a.offer.price - b.offer.price;
    }
    return a.dealer.score - b.dealer.score;
  });

  return (
    <main className="main">
      <Link href={`/family/${famId}`} className="back-link">← Back</Link>
      
      <div className="family-hero">
        <div className="family-hero-img" style={{ backgroundImage: imgUrl ? `url(${imgUrl})` : undefined }}>
          {!imgUrl && <span className="brand-placeholder">{w.brand || "—"}</span>}
        </div>
        <div className="family-hero-text">
          <h2>{w.brand} <span className="sep">//</span> {w.model_family}</h2>
          <div className="family-hero-name" style={{ fontSize: "18px", marginTop: "8px" }}>
            {w.reference} · <span style={{ color: "var(--fg-mute)" }}>{w.movement}</span>
          </div>
          {w.recommendations.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <span className="fac-label">Best factory: </span>
              <span className="best-factory">{w.recommendations[0].factory}</span>
              {w.recommendations[0].tier && (
                <span className={`tier-pill ${w.recommendations[0].tier === "NWBIG" ? "nwbig" : "super"}`} style={{ marginLeft: "8px" }}>
                  {w.recommendations[0].tier}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {w.recommendations.length > 0 && (
        <div className="section" style={{ marginTop: "32px" }}>
          <div className="section-label" style={{ marginBottom: "16px" }}>// FACTORY ALTERNATIVES</div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Rank</th>
                  <th>Factory</th>
                  <th>Tier</th>
                </tr>
              </thead>
              <tbody>
                {w.recommendations.map((rec) => (
                  <tr key={rec.factory}>
                    <td>#{rec.rank}</td>
                    <td>{rec.factory}</td>
                    <td>{rec.tier ? <span className={`tier-pill ${rec.tier === "NWBIG" ? "nwbig" : "super"}`}>{rec.tier}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: "48px" }}>
        <div className="section-label" style={{ marginBottom: "16px" }}>// DEALER OFFERS</div>
        {offersWithDealers.length > 0 ? (
          <div className="dealer-offers-grid">
            {offersWithDealers.map((x, idx) => (
              <DealerOfferCard key={x.dealer.id} w={w} dealer={x.dealer} state={state} rank={idx + 1} />
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--fg-dim)", fontStyle: "italic", padding: "16px", border: "1px dashed var(--line)" }}>
            No direct catalog offers found. View trusted dealers in the family page to check availability manually.
          </div>
        )}
      </div>
    </main>
  );
}
