"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function DeepLinkModal({ watchId, dealerId, dealerName, currentUrl }: { watchId: string; dealerId: string; dealerName: string; currentUrl?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  if (!session) return null; // Only logged-in users can see this

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setIsSubmitting(true);
    setMessage("");

    try {
      const res = await fetch("/api/deep-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchId, dealerId, url }),
      });

      if (res.ok) {
        setMessage("Deep link saved successfully!");
        setTimeout(() => {
          setIsOpen(false);
          router.refresh(); // Refresh page to pull new DB link
        }, 1000);
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to save link.");
      }
    } catch (error) {
      setMessage("An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          background: "none",
          border: "none",
          color: "var(--fg-dim)",
          textDecoration: "underline",
          fontSize: "11px",
          marginLeft: "12px",
          cursor: "pointer"
        }}
      >
        Edit Link
      </button>

      {isOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "var(--surface)",
            padding: "24px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--line-strong)",
            width: "100%",
            maxWidth: "400px",
            boxShadow: "var(--shadow)"
          }}>
            <h3 style={{ margin: "0 0 16px", color: "var(--fg)" }}>Edit Link: {dealerName}</h3>
            <p style={{ fontSize: "12px", color: "var(--fg-mute)", marginBottom: "16px" }}>
              Submit the exact URL for this watch on {dealerName}'s website. This updates the public catalog.
            </p>
            <form onSubmit={handleSubmit}>
              <input 
                type="url" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line-strong)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  marginBottom: "16px",
                  fontFamily: "var(--mono)",
                  fontSize: "13px"
                }}
              />
              {message && <div style={{ fontSize: "12px", color: message.includes("success") ? "var(--super-rep)" : "var(--danger)", marginBottom: "16px" }}>{message}</div>}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
                  style={{ padding: "8px 16px", background: "var(--surface-solid)", border: "1px solid var(--line)", color: "var(--fg)" }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ padding: "8px 16px", background: "var(--accent)", border: "none", color: "#fff", fontWeight: "500" }}
                >
                  {isSubmitting ? "Saving..." : "Save Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
