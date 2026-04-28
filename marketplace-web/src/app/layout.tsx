import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { getData } from "@/lib/server-data";
import { Providers } from "@/components/Providers";
import AuthButton from "@/components/AuthButton";
import { WatchSearch } from "@/components/WatchSearch";

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
  
  const popularSearches = [
    'Rolex Daytona 116500',
    'Patek Philippe Nautilus',
    'Omega Seamaster 300',
    'AP Royal Oak 15500',
  ];
  
  return (
    <html lang="en">
      <body className="flex h-screen w-full overflow-hidden bg-bg text-ink">
        <Providers>
          {/* Sidebar */}
          <aside className="w-64 p-6 hidden md:flex flex-col justify-between border-r-2 border-line shrink-0 overflow-y-auto">
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tighter italic font-serif mb-1 uppercase">
                  <Link href="/">REPTIME LOOKUP</Link>
                </h1>
                <div className="border border-line px-2 py-1 text-[10px] font-mono uppercase bg-green-100 mt-2">
                  DATABASE STATUS: SYNCED
                </div>
                <div className="mt-2 text-[10px] opacity-60 font-mono">
                  {watches.length} RECORDS / v2.0
                </div>
              </div>
              <nav className="space-y-6 pt-4">
                <div className="space-y-4">
                  <label className="text-[10px] font-mono opacity-50 block uppercase">QUICK SEARCH</label>
                  <WatchSearch watches={watches} />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-widest border-b border-line pb-1">Popular Models</div>
                  <ul className="text-xs space-y-2 pt-2 opacity-80 font-sans">
                    {popularSearches.map(s => (
                      <li key={s} className="cursor-pointer hover:underline transition-all hover:translate-x-1">
                        <Link href={`/?q=${encodeURIComponent(s.split(' ')[1])}`}>{s}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            </div>
            
            <div className="mt-8 space-y-4">
              <AuthButton />
              <div className="text-[10px] leading-tight opacity-50 font-mono">
                <p>SOURCES: R/REPTIME, XLS GUIDE,</p>
                <p>AND FACTORY INDEX v2.4</p>
                <div className="flex gap-2 mt-4">
                  <Link href="/about" className="hover:underline">ABOUT</Link>
                  <a href="https://reptime.help/" target="_blank" rel="noopener" className="hover:underline">HELP DB</a>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto h-full">
            {children}
            
            {/* Mobile Footer */}
            <footer className="md:hidden mt-8 pt-4 border-t border-line flex flex-col gap-4 text-[10px] font-mono shrink-0">
              <div className="flex justify-between items-center">
                 <span>{watches.length} RECORDS</span>
                 <AuthButton />
              </div>
              <div className="flex gap-4 opacity-60">
                 <Link href="/about">ABOUT</Link>
                 <a href="https://reptime.help/">HELP DB</a>
              </div>
            </footer>
          </main>
        </Providers>
      </body>
    </html>
  );
}
