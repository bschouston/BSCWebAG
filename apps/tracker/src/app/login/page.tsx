"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@bsc/ui";
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
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold tracking-tight">Tracker login</CardTitle>
          <CardDescription>Sign in to track match stats.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full h-11 font-bold"
            onClick={signInEmail}
            disabled={loading || !email.trim() || !password}
          >
            {loading ? "Signing in…" : "Sign in with Email"}
          </Button>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={signInGoogle}
            disabled={loading}
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
