"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profileNeedsCompletion } from "@/lib/its-number";
import { sanitizeReturnPath } from "@/lib/auth/return-url";
import { publicTrackerUrl } from "@/lib/site-url";

export default function PostLoginPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeReturnPath(searchParams.get("next"));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
      return;
    }

    const role = profile?.role;
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
    router.replace("/member");
  }, [loading, user, profile, router, next]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
