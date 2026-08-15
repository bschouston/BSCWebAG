import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin, verifyAuth } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function serialize(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    title: String(data.title ?? ""),
    sport: String(data.sport ?? ""),
    era: String(data.era ?? ""),
    imageUrl: data.imageUrl ? String(data.imageUrl) : null,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    enabled: data.enabled !== false,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  };
}

async function isAdminRequest(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return false;
  const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
  const role = userDoc.data()?.role;
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const admin = await isAdminRequest(request);
    const snap = await adminDb.collection("homepageLightbox").orderBy("sortOrder", "asc").get();
    let items = snap.docs.map(serialize);
    if (!admin) {
      items = items.filter((item) => item.enabled);
    }
    return NextResponse.json({ items });
  } catch (error) {
    console.error("homepage lightbox GET", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  try {
    const adminDb = getAdminDb();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const existing = await adminDb.collection("homepageLightbox").orderBy("sortOrder", "desc").limit(1).get();
    const nextOrder = existing.empty ? 0 : Number(existing.docs[0].data().sortOrder ?? 0) + 1;
    const now = Timestamp.now();
    const ref = adminDb.collection("homepageLightbox").doc();
    const doc = {
      title,
      sport: String(body.sport ?? "").trim(),
      era: String(body.era ?? "").trim(),
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : nextOrder,
      enabled: body.enabled !== false,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid ?? null,
    };
    await ref.set(doc);
    return NextResponse.json({ id: ref.id, ...doc, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() });
  } catch (error) {
    console.error("homepage lightbox POST", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
