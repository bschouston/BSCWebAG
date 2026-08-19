"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  isValidItsNumber,
  normalizeItsNumber,
  profileNeedsCompletion,
  profileNeedsGender,
  profileNeedsIts,
} from "@/lib/its-number";
import { PLAYER_GENDERS, PLAYER_GENDER_LABELS, type PlayerGender } from "@/lib/player-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CompleteProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [itsNumber, setItsNumber] = useState("");
  const [gender, setGender] = useState<PlayerGender | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsIts = profileNeedsIts(profile);
  const needsGender = profileNeedsGender(profile);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!profileNeedsCompletion(profile)) {
      const role = profile?.role;
      if (role === "ADMIN" || role === "SUPER_ADMIN") {
        router.replace("/admin");
      } else {
        router.replace("/member");
      }
    }
  }, [loading, user, profile, router]);

  const goHome = () => {
    const role = profile?.role;
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      router.replace("/admin");
    } else {
      router.replace("/member");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) return;

    if (needsIts) {
      const normalized = normalizeItsNumber(itsNumber);
      if (!isValidItsNumber(normalized)) {
        setError("Enter your 8-digit ITS number.");
        return;
      }
    }
    if (needsGender && (gender !== "male" && gender !== "female")) {
      setError("Select your gender.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      if (needsIts) {
        const res = await fetch("/api/member/its", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ itsNumber: normalizeItsNumber(itsNumber) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to save ITS#");
      }
      if (needsGender) {
        const res = await fetch("/api/member/profile/gender", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ gender }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to save gender");
      }
      await refreshProfile();
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || !profileNeedsCompletion(profile)) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canSubmit =
    (!needsIts || itsNumber.length === 8) && (!needsGender || Boolean(gender));

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            {needsIts
              ? "Enter your 8-digit ITS membership number. This cannot be changed later without Super Admin help."
              : "Select your gender to continue. This is required as per BSC policies."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsIts ? (
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
          ) : null}
          {needsGender ? (
            <div className="space-y-2 text-left">
              <Label>Gender</Label>
              <Select
                value={gender || undefined}
                onValueChange={(v) => setGender(v as PlayerGender)}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {PLAYER_GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {PLAYER_GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
            {submitting ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
