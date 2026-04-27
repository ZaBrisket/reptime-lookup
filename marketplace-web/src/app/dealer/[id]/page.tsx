import { getData } from "@/lib/server-data";
import Link from "next/link";
import WatchCard from "@/components/WatchCard";
import ReviewSection from "@/components/ReviewSection";
import { prisma } from "@/lib/prisma";

export function generateStaticParams() {
  const state = getData();
  return state.dealers.map((d) => ({
    id: d.id,
  }));
}

const FORUM_LABEL: Record<string, string> = { RWI: "RWI", REPGEEK: "RepGeek", RWG: "RWG" };

export default async function DealerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = getData();
  const dealer = state.dealers.find(d => d.id === id);

  if (!dealer) {
    return <div>Dealer not found.</div>;
  }

  // Find watches that have an offer from this dealer in the catalog
  const inventory = state.watches.filter(w => {
    return state.dealerCatalog?.offers?.[w.id]?.[dealer.id];
  });

  const reviews = await prisma.review.findMany({
    where: { targetType: "dealer", targetId: id },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="main">
      <Link href="/" className="back-link">← Back</Link>
      
      <div className="section" style={{ marginTop: "16px" }}>
        <h2>{dealer.name}</h2>
        
        {dealer.notes && (
          <div style={{ marginTop: "16px", marginBottom: "8px" }}>
            <span className="fac-label">Notes: </span> {dealer.notes}
          </div>
        )}
        
        <div style={{ marginTop: "8px", marginBottom: "16px" }}>
          <span className="fac-label">Trusted By: </span>
          {dealer.forum_codes.map(c => FORUM_LABEL[c] || c).join(", ")}
        </div>

        {dealer.website_url && (
          <div style={{ marginTop: "16px" }}>
            <a href={dealer.website_url} target="_blank" rel="noopener noreferrer" className="dealer-action" style={{ display: "inline-block", padding: "8px 16px", background: "var(--surface-deep)", border: "1px solid var(--line)", textDecoration: "none", color: "var(--fg)" }}>
              [ VISIT WEBSITE ]
            </a>
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: "48px" }}>
        <div className="section-label" style={{ marginBottom: "16px" }}>// DEALER INVENTORY ({inventory.length} matches)</div>
        <div className="results">
          {inventory.length > 0 ? (
            inventory.map((w) => <WatchCard key={w.id} w={w} state={state} />)
          ) : (
            <div style={{ color: "var(--fg-dim)", fontStyle: "italic" }}>No catalog offers found for this dealer.</div>
          )}
        </div>
      </div>

      <ReviewSection targetType="dealer" targetId={id} initialReviews={reviews as any} />
    </main>
  );
}
