"use client";

import { Button } from "@/components/ui/button";
import { useGoogleLogin } from "@/hooks/use-google-login";
import { useSearchParams } from "next/navigation";
import { sanitizeReturnPath } from "@/lib/auth/return-url";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = sanitizeReturnPath(searchParams.get("next"));
  const { login, error, isLoading } = useGoogleLogin(next);

  return (
    <div className="container flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 text-center bg-card p-8 rounded-xl shadow-lg border">
        <div className="flex justify-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/bsclogo.png" alt="Logo" className="h-20 w-auto object-contain" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Log in</h1>
          <p className="text-muted-foreground">
            Sign in with Google. New members will need to enter ITS# upon sign in.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Button onClick={login} disabled={isLoading} size="lg" className="w-full">
            {isLoading ? "Signing in..." : "Continue with Google"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
