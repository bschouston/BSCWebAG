"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isValidItsNumber, normalizeItsNumber, profileNeedsIts } from "@/lib/its-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CompleteProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [itsNumber, setItsNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profileNeedsIts(profile)) {
      const role = profile?.role;
      if (role === "ADMIN" || role === "SUPER_ADMIN") {
        router.replace("/admin");
      } else {
        router.replace("/member");
      }
    }
  }, [loading, user, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = normalizeItsNumber(itsNumber);
    if (!isValidItsNumber(normalized)) {
      setError("Enter your 8-digit ITS number.");
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/its", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itsNumber: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save ITS#");
      }
      await refreshProfile();
      const role = profile?.role;
      if (role === "ADMIN" || role === "SUPER_ADMIN") {
        router.replace("/admin");
      } else {
        router.replace("/member");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ITS#");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || !profileNeedsIts(profile)) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            Enter your 8-digit ITS membership number to continue. This cannot be changed later
            without Super Admin help.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 text-left">
            <Label htmlFor="itsNumber">ITS#</Label>
            <Input
              id="itsNumber"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              placeholder="12345678"
              value={itsNumber}
              onChange={(e) => setItsNumber(normalizeItsNumber(e.target.value).slice(0, 8))}
              disabled={submitting}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting || itsNumber.length !== 8}>
            {submitting ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
