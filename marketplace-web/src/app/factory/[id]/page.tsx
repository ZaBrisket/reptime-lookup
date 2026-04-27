import { getData } from "@/lib/server-data";
import Link from "next/link";
import WatchCard from "@/components/WatchCard";

export function generateStaticParams() {
  const state = getData();
  return Array.from(state.factoryInfo.keys()).map((id) => ({
    id: encodeURIComponent(id),
  }));
}

export default async function FactoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const state = getData();
  const factory = state.factoryInfo.get(decodedId);

  if (!factory) {
    return <div>Factory not found.</div>;
  }

  // Find watches where this factory is recommended
  const recommendedWatches = state.watches.filter(w => 
    w.recommendations.some(r => r.factory === decodedId)
  );

  return (
    <main className="main">
      <Link href="/" className="back-link">← Back</Link>
      
      <div className="section" style={{ marginTop: "16px" }}>
        <h2>{factory.display}</h2>
        
        {factory.specialty && (
          <div style={{ marginTop: "16px", marginBottom: "8px" }}>
            <span className="fac-label">Specialty: </span> {factory.specialty}
          </div>
        )}
        
        {factory.description && (
          <div style={{ marginTop: "8px", marginBottom: "16px", lineHeight: "1.6" }}>
            <span className="fac-label">Description: </span> {factory.description}
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: "48px" }}>
        <div className="section-label" style={{ marginBottom: "16px" }}>// RECOMMENDED WATCHES ({recommendedWatches.length})</div>
        <div className="results">
          {recommendedWatches.length > 0 ? (
            recommendedWatches.map((w) => <WatchCard key={w.id} w={w} state={state} />)
          ) : (
            <div style={{ color: "var(--fg-dim)", fontStyle: "italic" }}>No recommendations found for this factory.</div>
          )}
        </div>
      </div>
    </main>
  );
}
