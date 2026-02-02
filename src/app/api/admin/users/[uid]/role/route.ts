import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { Role } from "@/types";

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> }
) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    try {
        const { uid } = await params;
        const body = await request.json();
        const { role } = body;

        const validRoles: Role[] = ["MEMBER", "ADMIN", "SUPER_ADMIN"];
        // Wait, types/index.ts only has "MEMBER" | "ADMIN" | "SUPER_ADMIN". 
        // If "GUEST" isn't a type, I should probably check that. 
        // Let's stick to the defined types for now, or just generic string check if we want to support "GUEST" (maybe it means just no role?).
        // Actually, let's treat "MEMBER" as the base 'privileged' role. If someone is just a user, maybe they are "GUEST" conceptually but "MEMBER" in type?
        // Looking at types: export type Role = "MEMBER" | "ADMIN" | "SUPER_ADMIN";
        // So "GUEST" is NOT in the type definition. 
        // I will stick to "MEMBER" | "ADMIN" | "SUPER_ADMIN".

        if (!validRoles.includes(role)) {
            return new NextResponse("Invalid role", { status: 400 });
        }

        // 1. Update Firestore
        await adminDb.collection("users").doc(uid).update({
            role: role
        });

        // 2. Set Custom Claims (for Client SDK and Security Rules)
        await adminAuth.setCustomUserClaims(uid, { role });

        return NextResponse.json({ success: true, role });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error("Error updating user role:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
