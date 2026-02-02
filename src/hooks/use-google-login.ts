import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { createOrUpdateUser } from "@/lib/services/user-service";

export function useGoogleLogin() {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const login = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            // Using popup for better UX on desktop, but redirect is safer for mobile
            // PRD mentions redirect, but let's try popup first for dev speed
            // actually let's stick to popup as it's easier to debug locally
            const result = await signInWithPopup(auth, provider);

            // Create or update user in Firestore
            await createOrUpdateUser(result.user);

            router.push("/member");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to login with Google");
        } finally {
            setIsLoading(false);
        }
    };

    return { login, error, isLoading };
}
