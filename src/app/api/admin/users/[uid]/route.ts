import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> }
) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    try {
        const { uid } = await params;
        const userDoc = await adminDb.collection("users").doc(uid).get();

        if (!userDoc.exists) {
            return new NextResponse("User not found", { status: 404 });
        }

        const user = {
            ...userDoc.data(),
            uid: userDoc.id,
        };

        return NextResponse.json(user);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error("Error fetching user:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
