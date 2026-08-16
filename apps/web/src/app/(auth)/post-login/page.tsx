"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profileNeedsIts } from "@/lib/its-number";

function getTrackerUrl() {
  return process.env.NEXT_PUBLIC_TRACKER_URL ?? "http://localhost:3001";
}

export default function PostLoginPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    const role = profile?.role;
    if (role === "TRACKER") {
      window.location.assign(getTrackerUrl());
      return;
    }
    if (profileNeedsIts(profile)) {
      router.replace("/complete-profile");
      return;
    }
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      router.replace("/admin");
      return;
    }
    router.replace("/member");
  }, [loading, user, profile, router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

