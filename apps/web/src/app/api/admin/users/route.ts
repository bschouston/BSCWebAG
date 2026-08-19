import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { UserProfile } from "@/types";
import { isClubMemberRole } from "@/lib/member-access";

export async function GET(request: NextRequest) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const usersSnapshot = await adminDb.collection("users").orderBy("createdAt", "desc").get();

        const users: UserProfile[] = usersSnapshot.docs.map(doc => ({
            ...(doc.data() as Omit<UserProfile, "uid">),
            uid: doc.id,
        })).filter((u) => {
            if (!u.email) return false;
            if ((u as { isTrackerDevice?: boolean }).isTrackerDevice === true) return false;
            return isClubMemberRole(u.role);
        });

        return NextResponse.json(users);
         
    } catch (err: any) {
        console.error("Error fetching users:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
