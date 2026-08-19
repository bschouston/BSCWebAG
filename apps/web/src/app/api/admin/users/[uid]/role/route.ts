import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { Role } from "@/types";

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> }
) {
    const { error, user } = await requireAdmin(request);
    if (error || !user) return error;

    try {
        const adminAuth = getAdminAuth();
        const adminDb = getAdminDb();
        const { uid } = await params;
        const body = await request.json();
        const { role } = body;

        const validRoles: Role[] = ["MEMBER", "ADMIN", "SUPER_ADMIN", "TRACKER"];

        if (!validRoles.includes(role)) {
            return new NextResponse("Invalid role", { status: 400 });
        }

        if (role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
            return new NextResponse("Only a Super Admin can assign Super Admin", { status: 403 });
        }

        const targetSnap = await adminDb.collection("users").doc(uid).get();
        if (!targetSnap.exists) {
            return new NextResponse("User not found", { status: 404 });
        }
        const currentRole = (targetSnap.data()?.role ?? "MEMBER") as Role;
        if (currentRole === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
            return new NextResponse("Cannot change a Super Admin account", { status: 403 });
        }

        await adminDb.collection("users").doc(uid).update({
            role: role
        });

        await adminAuth.setCustomUserClaims(uid, { role });

        await writeAdminAudit({
            adminUid: user.uid,
            targetUid: uid,
            action: "account.role",
            meta: { role },
        });

        return NextResponse.json({ success: true, role });
         
    } catch (err: any) {
        console.error("Error updating user role:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
