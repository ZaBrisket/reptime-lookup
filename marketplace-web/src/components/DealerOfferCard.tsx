import { WatchRecord, DealerRecord, AppState } from "@/lib/types";
import { dealerLinkForWatch } from "@/lib/utils";
import Link from "next/link";
import DeepLinkModal from "./DeepLinkModal";
import { ArrowRightIcon } from "lucide-react";

export default function DealerOfferCard({ w, dealer, state, rank, dbUrl }: { w: WatchRecord; dealer: DealerRecord; state: AppState; rank: number; dbUrl?: string | null }) {
  const link = dealerLinkForWatch(dealer, w, state);
  const offer = link.offer;
  
  // Override with database deep link if available
  const finalUrl = dbUrl || link.url;
  
  const priceDisplay = offer?.price ? `$${offer.price} ${offer.currency || "USD"}` : "Check Site";
  const inStock = offer?.in_stock;

  return (
    <div className="flex flex-col md:flex-row bg-white border-2 border-line hover:shadow-[4px_4px_0px_var(--color-line)] transition-all overflow-hidden group">
      <div className="flex flex-col md:w-1/4 bg-surface-2 border-b-2 md:border-b-0 md:border-r-2 border-line p-4 relative">
        <div className="absolute top-0 right-0 bg-ink text-bg px-2 py-1 text-[10px] font-mono font-bold">
          #{rank}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-1">
          Dealer
        </div>
        <div className="font-bold text-lg mb-2 leading-tight">
          {dealer.name}
        </div>
        <div className="flex flex-wrap gap-1 mt-auto">
          {dealer.forum_codes.map((code) => (
            <span key={code} className="inline-block bg-white border border-line px-1.5 py-0.5 text-[9px] font-mono uppercase font-bold tracking-wider">
              {code}
            </span>
          ))}
        </div>
      </div>
      
      <div className="flex-1 p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-1">
            Listed Price
          </div>
          <div className="text-2xl font-bold font-mono tracking-tighter">
            {priceDisplay}
          </div>
          {inStock !== undefined && (
            <div className={`text-xs font-mono font-bold uppercase mt-2 ${inStock ? 'text-green-600' : 'text-red-600'}`}>
              {inStock ? '[ IN STOCK ]' : '[ OUT OF STOCK ]'}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2 w-full md:w-auto mt-4 md:mt-0">
          <a 
            href={finalUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center justify-between gap-4 bg-ink text-bg px-6 py-3 font-mono text-xs uppercase font-bold tracking-widest hover:bg-ink/80 transition-colors"
          >
            <span>View on Site</span>
            <ArrowRightIcon className="w-4 h-4" />
          </a>
          <DeepLinkModal watchId={w.id} dealerId={dealer.id} dealerName={dealer.name} currentUrl={finalUrl} />
        </div>
      </div>
    </div>
  );
}
