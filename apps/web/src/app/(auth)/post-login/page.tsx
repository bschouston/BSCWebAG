"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      router.replace("/admin");
      return;
    }
    if (role === "TRACKER") {
      window.location.assign(getTrackerUrl());
      return;
    }
    router.replace("/member");
  }, [loading, user, profile?.role, router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

