import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="main">
      <Link href="/" className="back-link">← Back</Link>
      
      <div className="section" style={{ marginTop: "16px" }}>
        <h2>About RepTime Lookup</h2>
        
        <div style={{ marginTop: "16px", lineHeight: "1.6", maxWidth: "800px" }}>
          <p style={{ marginBottom: "16px" }}>
            RepTime Lookup is a static, community-driven research tool for replica watches. It synthesizes two primary sources:
          </p>
          <ul style={{ marginBottom: "16px", paddingLeft: "24px" }}>
            <li>The <strong>Who Makes the Best</strong> spreadsheet maintained by the RepTime community.</li>
            <li>The <strong>reptime.help</strong> guide and trusted dealer list.</li>
          </ul>
          
          <h3 style={{ marginTop: "32px", marginBottom: "16px" }}>Methodology</h3>
          <p style={{ marginBottom: "16px" }}>
            This site merges those lists into a single searchable index. Factory tiers (NWBIG, Super Rep) and ranks are derived strictly from community consensus. Dealer rankings are calculated based on which forums (RWI, RepGeek, RWG) trust them.
          </p>

          <h3 style={{ marginTop: "32px", marginBottom: "16px", color: "var(--accent)" }}>Disclaimers</h3>
          <p style={{ marginBottom: "16px" }}>
            This is an educational research tool only. Replicas are unauthorized reproductions. This site does not sell watches, handle money, or use affiliate links. Users transact with third-party dealers entirely at their own risk. Prices and stock availability are scraped automatically and may be out of date.
          </p>

          <h3 style={{ marginTop: "32px", marginBottom: "16px" }}>Source Code</h3>
          <p>
            The project is open source and built with Next.js. Deployed to GitHub Pages.
          </p>
        </div>
      </div>
    </main>
  );
}
