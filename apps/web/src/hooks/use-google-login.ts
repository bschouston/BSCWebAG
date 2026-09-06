import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { createOrUpdateUser } from "@/lib/services/user-service";
import { ensureClubMemberSession } from "@/lib/auth/ensure-club-member-client";
import { postLoginHref } from "@/lib/auth/return-url";

export function useGoogleLogin(next?: string | null) {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await createOrUpdateUser(result.user);
            await ensureClubMemberSession(result.user);
            router.push(postLoginHref(next));
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to login with Google");
        } finally {
            setIsLoading(false);
        }
    };

    return { login, error, isLoading };
}
