import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { getData } from "@/lib/server-data";
import { Providers } from "@/components/Providers";
import AuthButton from "@/components/AuthButton";

export const metadata: Metadata = {
  title: "RepTime Lookup",
  description: "Educational research tool for replica watches.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { watches, dealers, brands } = getData();
  
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>
              <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="brand">REPTIME LOOKUP</span>
                <span className="sep">//</span>
                <span id="hdr-records">{watches.length} RECORDS</span>
                <span className="sep">//</span>
                <span className="ver">V2</span>
              </Link>
            </h1>
            <AuthButton />
          </header>

          {children}

        <footer className="ftr">
          <span id="stats">{watches.length} WATCHES · {dealers.length} DEALERS · {brands.length} BRANDS</span>
          <a href="https://www.reddit.com/r/RepTime/wiki/index/" target="_blank" rel="noopener">r/RepTime wiki</a>
          <a href="https://reptime.help/" target="_blank" rel="noopener">reptime.help</a>
          <Link href="/about">About</Link>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
