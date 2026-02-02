import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { UserProfile } from "@/types";

export async function GET(request: NextRequest) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    try {
        const usersSnapshot = await adminDb.collection("users").orderBy("createdAt", "desc").get();

        const users: UserProfile[] = usersSnapshot.docs.map(doc => ({
            ...(doc.data() as Omit<UserProfile, "uid">),
            uid: doc.id,
        })).filter(u => u.email); // Filter out any malformed docs if any

        return NextResponse.json(users);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error("Error fetching users:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
