"use client";

import { useState } from "react";
import Image from "next/image";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@bsc/ui";
import { auth } from "@/lib/firebase/client";

async function completeFantasyLogin() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Missing session token");

  const res = await fetch("/api/auth/fantasy-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await signOut(auth);
    throw new Error(data?.error ?? "Not authorized for Fantasy access");
  }
  return data as { isFantasyAdmin?: boolean };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const signInGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      await completeFantasyLogin();
      window.location.assign("/");
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const signInAdmin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const data = await completeFantasyLogin();
      window.location.assign(data.isFantasyAdmin ? "/admin" : "/");
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="bsc-accent-card w-full max-w-md border-x-0 border-b-0 shadow-xl bg-card">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto relative h-16 w-16">
            <Image src="/images/bsclogo.png" alt="BSC" fill className="object-contain" />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-tight text-foreground">
            BSC Fantasy
          </CardTitle>
          <CardDescription className="text-base">
            Build your team from live tournament stats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showAdminLogin ? (
            <>
              <Button
                className="w-full h-12 font-bold text-base bg-bsc-red text-bsc-red-foreground hover:bg-bsc-red/90"
                onClick={signInGoogle}
                disabled={loading}
              >
                {loading ? "Signing in…" : "Continue with Google"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setShowAdminLogin(true)}
              >
                Fantasy admin sign-in
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Admin email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button
                className="w-full h-11 font-bold"
                onClick={signInAdmin}
                disabled={loading || !email.trim() || !password}
              >
                {loading ? "Signing in…" : "Sign in as admin"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setShowAdminLogin(false);
                  setError(null);
                }}
              >
                Back to Google sign-in
              </button>
            </>
          )}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
