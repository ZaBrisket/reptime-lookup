import Link from "next/link";
import { FamilyRecord, AppState } from "@/lib/types";
import { familyImageUrl } from "@/lib/images";

export default function FamilyCard({ fam, state }: { fam: FamilyRecord; state: AppState }) {
  const imageUrl = familyImageUrl(fam, state);

  return (
    <Link href={`/family/${encodeURIComponent(fam.id)}`} className={`family-card ${fam.legacy ? "legacy" : ""}`}>
      <div className="family-img" style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}>
        {!imageUrl && <span className="brand-placeholder">{fam.brand}</span>}
      </div>
      <div className="family-body">
        <div className="family-title">
          <span className="family-brand">{fam.brand}</span>
          <span className="family-name">{fam.family}</span>
          {fam.legacy && <span className="legacy-tag">legacy</span>}
        </div>
        <div className="family-meta">
          <span className="variants">
            {fam.variant_count} variant{fam.variant_count === 1 ? "" : "s"}
          </span>
          {fam.consensus_best && (
            <span className="family-best">
              <span className="best-label">Best</span>
              <span className="best-factory">{fam.consensus_best.factory}</span>
              {fam.consensus_best.tier && (
                <span className={`tier-pill ${fam.consensus_best.tier === "NWBIG" ? "nwbig" : "super"}`}>
                  {fam.consensus_best.tier}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
