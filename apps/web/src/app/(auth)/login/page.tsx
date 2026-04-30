"use client";

import { Button } from "@/components/ui/button";
import { useGoogleLogin } from "@/hooks/use-google-login";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { createOrUpdateUser } from "@/lib/services/user-service";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const { login, error, isLoading } = useGoogleLogin();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pwLoading, setPwLoading] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    const handleEmailLogin = async () => {
        setPwLoading(true);
        setPwError(null);
        try {
            const result = await signInWithEmailAndPassword(auth, email.trim(), password);
            await createOrUpdateUser(result.user);
            router.push("/post-login");
        } catch (err: any) {
            console.error(err);
            setPwError(err?.message ?? "Failed to sign in.");
        } finally {
            setPwLoading(false);
        }
    };

    return (
        <div className="container flex h-screen items-center justify-center">
            <div className="w-full max-w-md space-y-8 text-center bg-card p-8 rounded-xl shadow-lg border">
                <div className="flex justify-center mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/bsclogo.png" alt="Logo" className="h-20 w-auto object-contain" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">Log in</h1>
                    <p className="text-muted-foreground">Welcome back to Burhani Sports Club</p>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="text-left space-y-2">
                        <div className="space-y-1">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </div>
                        <Button
                            onClick={handleEmailLogin}
                            disabled={pwLoading || !email.trim() || !password}
                            size="lg"
                            className="w-full"
                        >
                            {pwLoading ? "Signing in..." : "Sign in with Email"}
                        </Button>
                        {pwError && <p className="text-sm text-destructive">{pwError}</p>}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-px bg-border flex-1" />
                        <span className="text-xs text-muted-foreground">OR</span>
                        <div className="h-px bg-border flex-1" />
                    </div>

                    <Button onClick={login} disabled={isLoading} size="lg" className="w-full">
                        {isLoading ? "Signing in..." : "Sign in with Google"}
                    </Button>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
            </div>
        </div>
    )
}
