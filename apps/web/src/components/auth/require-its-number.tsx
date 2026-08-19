"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profileNeedsCompletion } from "@/lib/its-number";

/**
 * Redirects club-role users missing ITS# or gender to /complete-profile.
 */
export function RequireItsNumber({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsCompletion = profileNeedsCompletion(profile);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (needsCompletion && pathname !== "/complete-profile") {
      router.replace("/complete-profile");
    }
  }, [loading, user, needsCompletion, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user && needsCompletion) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
