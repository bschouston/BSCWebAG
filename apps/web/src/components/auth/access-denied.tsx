"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function getTrackerUrl() {
  return process.env.NEXT_PUBLIC_TRACKER_URL ?? "http://localhost:3001";
}

export function AccessDenied() {
  const { profile, signOut } = useAuth();

  const primaryCta = useMemo(() => {
    const role = profile?.role;
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      return { href: "/admin", label: "Go to Admin Console" };
    }
    if (role === "TRACKER") {
      return { href: getTrackerUrl(), label: "Go to Tracker Console", external: true as const };
    }
    return { href: "/member", label: "Go to Member Dashboard" };
  }, [profile?.role]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            You’re signed in, but you don’t have permission to view this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {primaryCta.external ? (
            <a href={primaryCta.href}>
              <Button className="w-full">{primaryCta.label}</Button>
            </a>
          ) : (
            <Link href={primaryCta.href}>
              <Button className="w-full">{primaryCta.label}</Button>
            </Link>
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

