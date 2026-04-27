import { WatchRecord, DealerRecord, AppState } from "@/lib/types";
import { dealerLinkForWatch } from "@/lib/utils";
import Link from "next/link";
import DeepLinkModal from "./DeepLinkModal";

export default function DealerOfferCard({ w, dealer, state, rank, dbUrl }: { w: WatchRecord; dealer: DealerRecord; state: AppState; rank: number; dbUrl?: string | null }) {
  const link = dealerLinkForWatch(dealer, w, state);
  const offer = link.offer;
  
  // Override with database deep link if available
  const finalUrl = dbUrl || link.url;
  
  const priceDisplay = offer?.price ? `$${offer.price} ${offer.currency || "USD"}` : "Check Site";
  const inStock = offer?.in_stock;

  return (
    <div className="dealer-offer-card">
      <div className="dealer-head">
        <span className="dealer-rank">#{rank}</span>
        <span className="dealer-name">{dealer.name}</span>
        <div className="dealer-badges">
          {dealer.forum_codes.map((code) => (
            <span key={code} className="forum-badge">{code}</span>
          ))}
        </div>
      </div>
      <div className="dealer-body">
        <div className="dealer-price">{priceDisplay}</div>
        {inStock !== undefined && (
          <div className="dealer-stock">
            {inStock ? <span className="stock-in">[ IN STOCK ]</span> : <span className="stock-out">[ OUT OF STOCK ]</span>}
          </div>
        )}
      </div>
      <div className="dealer-footer" style={{ display: "flex", alignItems: "center" }}>
        <a href={finalUrl} target="_blank" rel="noopener noreferrer" className="dealer-cta">
          [ VIEW ON SITE ]
        </a>
        <DeepLinkModal watchId={w.id} dealerId={dealer.id} dealerName={dealer.name} currentUrl={finalUrl} />
      </div>
    </div>
  );
}
