"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export default function AuthButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <Link href="/profile" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Profile</Link>
        <button onClick={() => signOut()} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7 }}>Sign Out</button>
      </div>
    );
  }

  return (
    <button onClick={() => signIn()} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sign In</button>
  );
}
