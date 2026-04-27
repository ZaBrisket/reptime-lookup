"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { WatchRecord } from "@/lib/types";

function CompareContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",") || [];
  
  return (
    <div className="section" style={{ marginTop: "16px" }}>
      <h2>Compare Watches</h2>
      <p style={{ marginTop: "16px", color: "var(--fg-dim)" }}>
        Comparison feature is under construction. Selected IDs: {ids.join(", ")}
      </p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <main className="main">
      <Link href="/" className="back-link">← Back</Link>
      <Suspense fallback={<div style={{ marginTop: "16px" }}>Loading comparison...</div>}>
        <CompareContent />
      </Suspense>
    </main>
  );
}
