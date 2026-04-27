import Link from "next/link";
import { WatchRecord, AppState } from "@/lib/types";
import { getLowestPrice } from "@/lib/utils";
import { watchImageUrl } from "@/lib/images";

export default function WatchCard({ w, state }: { w: WatchRecord; state: AppState }) {
  const imageUrl = watchImageUrl(w, state);
  const bestRec = w.recommendations[0];
  const lowestPrice = getLowestPrice(w, state);

  return (
    <Link href={`/watch/${encodeURIComponent(w.id)}`} className={`card ${w.legacy ? "legacy" : ""}`}>
      <div className="card-head">
        <div className="card-img" style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}>
          {!imageUrl && <span className="brand-placeholder">{w.brand || "—"}</span>}
        </div>
        <div className="card-title-wrap">
          <div className="card-title-line">
            <span className="brand">{w.brand || "Unknown"}</span>
            {w.model_family && (
              <>
                <span className="sep">//</span>
                <span className="family">{w.model_family}</span>
              </>
            )}
            {w.legacy && <span className="legacy-tag">legacy</span>}
          </div>
          <div className="card-title-sub">
            {w.reference && <span className="ref">{w.reference}</span>}
            {w.reference && w.movement && <span className="sep">·</span>}
            {w.movement && <span className="movement">{w.movement}</span>}
          </div>
          {bestRec && (
            <div className="card-title-sub" style={{ marginTop: "4px" }}>
              <span className="fac">
                <span className="fac-label">Best: </span>
                {bestRec.factory}
              </span>
              {bestRec.tier && (
                <span className={`tier-pill ${bestRec.tier === "NWBIG" ? "nwbig" : "super"}`}>
                  {bestRec.tier}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        {lowestPrice ? (
          <div className="price-line">
            FROM ${lowestPrice.price} ON REPTIME
          </div>
        ) : (
          <div className="price-line">VIEW DETAILS →</div>
        )}
      </div>
    </Link>
  );
}
