"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Review = {
  id: string;
  rating: number;
  text: string;
  createdAt: Date;
  user: { email: string };
};

export default function ReviewSection({ targetType, targetId, initialReviews }: { targetType: "dealer" | "factory", targetId: string, initialReviews: Review[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return alert("Please sign in to leave a review.");
    
    setSubmitting(true);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, rating, text })
    });
    setSubmitting(false);

    if (res.ok) {
      setText("");
      router.refresh();
    } else {
      alert("Failed to submit review.");
    }
  };

  return (
    <div style={{ marginTop: "40px", borderTop: "1px solid #333", paddingTop: "20px" }}>
      <div className="section-label" style={{ marginBottom: "20px" }}>Community Reviews</div>
      
      {initialReviews.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: "italic", marginBottom: "20px" }}>No reviews yet. Be the first!</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginBottom: "30px" }}>
          {initialReviews.map(r => (
            <div key={r.id} style={{ background: "#1a1a1a", padding: "15px", borderLeft: "3px solid #4caf50" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontWeight: "bold" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span style={{ fontSize: "12px", opacity: 0.5 }}>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ fontSize: "14px", margin: "0 0 10px 0" }}>{r.text}</p>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>By: {r.user.email}</div>
            </div>
          ))}
        </div>
      )}

      {session ? (
        <form onSubmit={handleSubmit} style={{ background: "#111", padding: "20px", border: "1px solid #333" }}>
          <h4 style={{ margin: "0 0 15px 0", fontFamily: "Space Mono, monospace", textTransform: "uppercase" }}>Leave a Review</h4>
          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Rating</label>
            <select value={rating} onChange={e => setRating(Number(e.target.value))} style={{ background: "#000", color: "#fff", border: "1px solid #333", padding: "8px", width: "100px" }}>
              <option value={5}>★★★★★ (5)</option>
              <option value={4}>★★★★☆ (4)</option>
              <option value={3}>★★★☆☆ (3)</option>
              <option value={2}>★★☆☆☆ (2)</option>
              <option value={1}>★☆☆☆☆ (1)</option>
            </select>
          </div>
          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Review</label>
            <textarea 
              value={text} 
              onChange={e => setText(e.target.value)}
              required
              rows={4}
              style={{ width: "100%", background: "#000", color: "#fff", border: "1px solid #333", padding: "10px", fontFamily: "inherit" }}
              placeholder="Share your experience..."
            />
          </div>
          <button type="submit" disabled={submitting} style={{ background: "#fff", color: "#000", border: "none", padding: "10px 20px", fontWeight: "bold", textTransform: "uppercase", cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      ) : (
        <div style={{ background: "#111", padding: "20px", border: "1px dashed #333", textAlign: "center" }}>
          <p style={{ margin: 0, opacity: 0.7 }}>Please sign in to leave a review.</p>
        </div>
      )}
    </div>
  );
}
