import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

export interface AuthenticatedUser {
    uid: string;
    email?: string;
    role: "MEMBER" | "ADMIN" | "SUPER_ADMIN";
}

/**
 * Verifies the Firebase ID Token from the Authorization header.
 * Returns the decoded token or null if invalid.
 */
export async function verifyAuth(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.split("Bearer ")[1];
    try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken;
    } catch (error) {
        console.error("verifyAuth error:", error);
        return null;
    }
}

/**
 * Checks if the authenticated user has the required role.
 * Fetches the user's role from Firestore to ensure it's up-to-date.
 */
export async function requireRole(request: NextRequest, allowedRoles: string[]) {
    const decoded = await verifyAuth(request);
    if (!decoded) {
        return { error: new NextResponse("Unauthorized", { status: 401 }), user: null };
    }

    try {
        const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

        if (!userDoc.exists) {
            return { error: new NextResponse("User not found", { status: 404 }), user: null };
        }

        const userData = userDoc.data();
        const userRole = userData?.role || "MEMBER";

        if (!allowedRoles.includes(userRole)) {
            return { error: new NextResponse("Forbidden", { status: 403 }), user: null };
        }

        return {
            error: null,
            user: {
                uid: decoded.uid,
                email: decoded.email,
                role: userRole
            } as AuthenticatedUser
        };

    } catch (error) {
        console.error("requireRole error:", error);
        return { error: new NextResponse("Internal Server Error", { status: 500 }), user: null };
    }
}

// Helper wrappers
export async function requireAdmin(request: NextRequest) {
    return requireRole(request, ["ADMIN", "SUPER_ADMIN"]);
}

export async function requireSuperAdmin(request: NextRequest) {
    return requireRole(request, ["SUPER_ADMIN"]);
}
