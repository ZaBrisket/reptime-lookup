import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getData } from "@/lib/server-data";
import WatchCard from "@/components/WatchCard";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/api/auth/signin");
  }

  const userId = (session.user as any).id;
  const state = getData();

  const favoriteRecords = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const favoriteIds = favoriteRecords.map((f) => f.watchId);
  const favoriteWatches = favoriteIds
    .map((id) => state.watches.find((w: any) => w.id === id))
    .filter(Boolean);

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ fontFamily: "Space Mono, monospace", textTransform: "uppercase", marginBottom: "20px" }}>
        Your Wishlist ({favoriteWatches.length})
      </h2>
      <p style={{ marginBottom: "20px", opacity: 0.7 }}>
        Logged in as: {session.user.email}
      </p>

      {favoriteWatches.length === 0 ? (
        <div style={{ opacity: 0.5, fontStyle: "italic" }}>
          You haven't saved any watches yet. Click the heart icon on any watch to save it here!
        </div>
      ) : (
        <div className="results">
          {favoriteWatches.map((w: any) => (
            <WatchCard key={w.id} w={w} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}
