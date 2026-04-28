import { getData } from "@/lib/server-data";
import { slugify } from "@/lib/utils";
import { watchImageUrl } from "@/lib/images";
import Link from "next/link";
import DealerOfferCard from "@/components/DealerOfferCard";
import { prisma } from "@/lib/prisma";
import { ArrowLeftIcon, WatchIcon } from "lucide-react";

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
    return <div className="p-8 text-ink font-mono uppercase text-sm">Watch not found.</div>;
  }

  const famId = `${slugify(w.brand)}--${slugify(w.model_family)}`;
  const imgUrl = watchImageUrl(w, state);

  // Fetch community/admin deep links from Postgres
  const dbDeepLinks = await prisma.deepLink.findMany({
    where: { watchId: w.id }
  });
  const dbLinksByDealer = Object.fromEntries(
    dbDeepLinks.map(l => [l.dealerId, l.url])
  );

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
    <div className="flex-1 w-full max-w-5xl animate-in fade-in">
      <Link 
        href={`/?q=${encodeURIComponent(w.brand + ' ' + w.model_family)}`}
        className="inline-flex items-center gap-2 mb-8 text-xs font-mono uppercase tracking-widest hover:underline opacity-60 hover:opacity-100"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Back to Catalog
      </Link>
      
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row bg-white border-2 border-line hover:shadow-[4px_4px_0px_var(--color-line)] transition-all overflow-hidden mb-12">
        <div className="md:w-1/2 aspect-square md:aspect-auto bg-[#F7F7F5] flex items-center justify-center border-b-2 md:border-b-0 md:border-r-2 border-line relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/5 mix-blend-multiply"></div>
          {imgUrl ? (
            <img src={imgUrl} alt={w.model_family} className="w-full h-full object-contain p-8 mix-blend-multiply" />
          ) : (
            <div className="w-32 h-32 rounded-full border-4 border-line/10 flex items-center justify-center bg-white/50 shadow-inner">
              <WatchIcon className="w-12 h-12 text-line/40" strokeWidth={1.5} />
            </div>
          )}
          {!imgUrl && (
            <div className="absolute bottom-4 right-4 text-[10px] font-mono text-line/40 uppercase font-bold tracking-widest">
              IMAGE PENDING
            </div>
          )}
        </div>
        
        <div className="p-6 md:p-8 flex flex-col justify-center w-full">
          <div className="text-xs font-mono uppercase tracking-widest opacity-60 mb-2 border-b border-line/10 pb-2">
            {w.brand}
          </div>
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-tighter mb-4 leading-none">
            {w.model_family}
          </h2>
          <div className="space-y-4 font-mono text-sm">
            <div className="flex justify-between border-b border-line/10 pb-2">
              <span className="opacity-60 uppercase">Reference</span>
              <span className="font-bold">{w.reference}</span>
            </div>
            <div className="flex justify-between border-b border-line/10 pb-2">
              <span className="opacity-60 uppercase">Movement</span>
              <span className="text-right max-w-[200px] truncate" title={w.movement || ''}>{w.movement || 'Unknown'}</span>
            </div>
          </div>

          {w.recommendations.length > 0 && (
            <div className="mt-8 bg-surface-2 border border-line p-4 relative">
              <div className="absolute -top-3 left-4 bg-white border border-line px-2 text-[10px] font-mono uppercase tracking-widest font-bold text-ink">
                Consensus Best
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">{w.recommendations[0].factory}</span>
                {w.recommendations[0].tier && (
                  <span className="bg-green-100 text-green-900 border border-green-900/20 px-2 py-1 text-xs font-mono uppercase font-bold">
                    {w.recommendations[0].tier}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {w.recommendations.length > 0 && (
        <div className="mb-12">
          <h3 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-line pb-2">// FACTORY ALTERNATIVES</h3>
          <div className="overflow-x-auto border-2 border-line bg-white shadow-[4px_4px_0px_var(--color-line)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-line bg-surface-2 text-xs font-mono uppercase tracking-widest">
                  <th className="p-4 border-r-2 border-line w-20 text-center">Rank</th>
                  <th className="p-4 border-r-2 border-line">Factory</th>
                  <th className="p-4 w-32">Tier</th>
                </tr>
              </thead>
              <tbody className="text-sm font-sans">
                {w.recommendations.map((rec, i) => (
                  <tr key={rec.factory} className="border-b border-line last:border-0 hover:bg-surface-2 transition-colors">
                    <td className="p-4 border-r-2 border-line text-center font-mono font-bold opacity-60">#{rec.rank}</td>
                    <td className="p-4 border-r-2 border-line font-bold">{rec.factory}</td>
                    <td className="p-4">
                      {rec.tier ? (
                        <span className="inline-block bg-line text-white px-2 py-1 text-[10px] font-mono uppercase tracking-widest font-bold">
                          {rec.tier}
                        </span>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-12">
        <h3 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-line pb-2">// DEALER OFFERS</h3>
        {offersWithDealers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {offersWithDealers.map((x, idx) => (
              <DealerOfferCard 
                key={x.dealer.id} 
                w={w} 
                dealer={x.dealer} 
                state={state} 
                rank={idx + 1} 
                dbUrl={dbLinksByDealer[x.dealer.id]}
              />
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-line/40 p-8 text-center text-sm font-mono uppercase opacity-60">
            No direct catalog offers found. View trusted dealers to check availability manually.
          </div>
        )}
      </div>
    </div>
  );
}
