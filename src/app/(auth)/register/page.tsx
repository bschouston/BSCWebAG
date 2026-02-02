"use client";

import { Button } from "@/components/ui/button";
import { useGoogleLogin } from "@/hooks/use-google-login";
import Link from "next/link";

export default function RegisterPage() {
    const { login, error, isLoading } = useGoogleLogin();

    return (
        <div className="container flex h-screen items-center justify-center">
            <div className="w-full max-w-md space-y-8 text-center">
                <div className="space-y-2">
                    <h1 className="text-4xl font-bold">Join the Club</h1>
                    <p className="text-muted-foreground">Create your account to start RSVPing for events</p>
                </div>

                <div className="flex flex-col gap-4">
                    <Button onClick={login} disabled={isLoading} size="lg" className="w-full">
                        {isLoading ? "Signing up..." : "Sign up with Google"}
                    </Button>
                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                            Log in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
