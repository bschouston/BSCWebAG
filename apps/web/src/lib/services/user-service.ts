import { db } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { User } from "firebase/auth";

function namesFromGoogleDisplayName(displayName: string | null | undefined) {
    const parts = (displayName || "").trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
    };
}

export async function createOrUpdateUser(user: User) {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    const { firstName, lastName } = namesFromGoogleDisplayName(user.displayName);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            firstName,
            lastName,
            photoURL: user.photoURL,
            role: "MEMBER",
            tokenBalance: 0,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } else {
        const existing = userSnap.data() ?? {};
        // Super Admin overrides must not be wiped by Google login resync.
        if (existing.identityOverride === true) {
            await updateDoc(userRef, { updatedAt: serverTimestamp() });
            return;
        }
        await updateDoc(userRef, {
            firstName,
            lastName,
            photoURL: user.photoURL ?? null,
            updatedAt: serverTimestamp(),
        });
    }
}
