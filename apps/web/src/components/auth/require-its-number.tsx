"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profileNeedsIts } from "@/lib/its-number";

/**
 * Redirects club-role users without an ITS# to /complete-profile.
 * Render as a wrapper around dashboard content.
 */
export function RequireItsNumber({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsIts = profileNeedsIts(profile);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (needsIts && pathname !== "/complete-profile") {
      router.replace("/complete-profile");
    }
  }, [loading, user, needsIts, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user && needsIts) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
