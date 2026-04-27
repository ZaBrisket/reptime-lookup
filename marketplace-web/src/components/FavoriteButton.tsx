"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export default function FavoriteButton({ watchId, initialIsFavorite = false }: { watchId: string, initialIsFavorite?: boolean }) {
  const { data: session } = useSession();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);

  useEffect(() => {
    if (session && !initialIsFavorite) {
      // Fetch if it's a favorite
      fetch("/api/favorites")
        .then(res => res.json())
        .then(data => {
          if (data.favorites && data.favorites.includes(watchId)) {
            setIsFavorite(true);
          }
        });
    }
  }, [session, watchId, initialIsFavorite]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to the watch link
    if (!session) {
      alert("Please sign in to save favorites.");
      return;
    }

    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchId })
    });

    if (res.ok) {
      const data = await res.json();
      setIsFavorite(data.status === "added");
    }
  };

  return (
    <button 
      onClick={toggleFavorite}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '18px',
        color: isFavorite ? '#e91e63' : '#666',
        padding: '5px',
        marginLeft: 'auto'
      }}
      aria-label="Toggle Favorite"
    >
      {isFavorite ? "♥" : "♡"}
    </button>
  );
}
