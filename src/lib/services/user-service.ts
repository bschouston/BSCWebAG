import { db } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { User } from "firebase/auth";

export async function createOrUpdateUser(user: User) {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // Create new user
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            firstName: user.displayName?.split(" ")[0] || "",
            lastName: user.displayName?.split(" ").slice(1).join(" ") || "",
            photoURL: user.photoURL,
            role: "MEMBER", // Default role
            tokenBalance: 0,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } else {
        // Update existing user login metadata if needed
        await updateDoc(userRef, {
            updatedAt: serverTimestamp(),
            // We could update photoURL or name if changed in Google, but maybe better to respect manual edits
        });
    }
}
