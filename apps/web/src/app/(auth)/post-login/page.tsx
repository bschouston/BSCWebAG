"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profileNeedsCompletion } from "@/lib/its-number";
import { sanitizeReturnPath } from "@/lib/auth/return-url";
import { ensureClubMemberSession } from "@/lib/auth/ensure-club-member-client";
import { publicTrackerUrl } from "@/lib/site-url";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { UserProfile } from "@/types";

export default function PostLoginPage() {
  const { user, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeReturnPath(searchParams.get("next"));
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
      return;
    }
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        await ensureClubMemberSession(user);
        await refreshProfile();
        const snap = await getDoc(doc(db, "users", user.uid));
        const profile = snap.exists() ? (snap.data() as UserProfile) : null;
        const role = profile?.role as string | undefined;

        if (role === "TRACKER") {
          window.location.assign(publicTrackerUrl());
          return;
        }
        if (profileNeedsCompletion(profile)) {
          router.replace("/complete-profile");
          return;
        }
        if (next) {
          router.replace(next);
          return;
        }
        if (role === "ADMIN" || role === "SUPER_ADMIN") {
          router.replace("/admin");
          return;
        }
        if (role === "FANTASY") {
          router.replace("/");
          return;
        }
        router.replace("/member");
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Login routing failed");
      }
    })();
  }, [loading, user, next, router, refreshProfile]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[60vh] p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button type="button" className="text-sm underline" onClick={() => router.replace("/login")}>
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
