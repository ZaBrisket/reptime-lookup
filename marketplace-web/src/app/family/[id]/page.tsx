import { getData } from "@/lib/server-data";
import { familyImageUrl } from "@/lib/images";
import Link from "next/link";
import WatchCard from "@/components/WatchCard";

export function generateStaticParams() {
  const state = getData();
  return state.families.map((f) => ({
    id: f.id,
  }));
}

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = getData();
  const fam = state.familyById.get(id);

  if (!fam) {
    return <div>Family not found.</div>;
  }

  const imgUrl = familyImageUrl(fam, state);

  return (
    <main className="main">
      <Link href="/" className="back-link">← Back to browse</Link>
      
      <div className="family-hero">
        <div className="family-hero-img" style={{ backgroundImage: imgUrl ? `url(${imgUrl})` : undefined }}>
          {!imgUrl && <span className="brand-placeholder">{fam.brand}</span>}
        </div>
        <div className="family-hero-text">
          <h2>{fam.brand} <span className="sep">//</span> {fam.family}</h2>
          {fam.legacy && <span className="legacy-tag" style={{ marginTop: "8px", display: "inline-block" }}>legacy</span>}
          {fam.consensus_best && (
            <div style={{ marginTop: "16px" }}>
              <span className="fac-label">Consensus Best: </span>
              <span className="best-factory">{fam.consensus_best.factory}</span>
              {fam.consensus_best.tier && (
                <span className={`tier-pill ${fam.consensus_best.tier === "NWBIG" ? "nwbig" : "super"}`} style={{ marginLeft: "8px" }}>
                  {fam.consensus_best.tier}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="section" style={{ marginTop: "32px" }}>
        <div className="section-label" style={{ marginBottom: "16px" }}>// VARIANTS</div>
        <div className="results">
          {fam.variants.map((w) => (
            <WatchCard key={w.id} w={w} state={state} />
          ))}
        </div>
      </div>
    </main>
  );
}
