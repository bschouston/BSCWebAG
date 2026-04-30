"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      window.location.assign("/");
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      window.location.assign("/");
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Tracker login</h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>Sign in to track matches.</p>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>
        <button
          onClick={signInEmail}
          disabled={loading || !email.trim() || !password}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff" }}
        >
          {loading ? "Signing in…" : "Sign in with Email"}
        </button>
        <button
          onClick={signInGoogle}
          disabled={loading}
          style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
        >
          Sign in with Google
        </button>
        {error && <div style={{ color: "crimson", fontSize: 12 }}>{error}</div>}
      </div>
    </main>
  );
}

