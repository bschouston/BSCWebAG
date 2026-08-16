import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Public/member: active top-up pricing tiers only. */
export async function GET() {
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb
      .collection("tokenTopUpTiers")
      .where("active", "==", true)
      .orderBy("sortOrder", "asc")
      .get();

    const tiers = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        tokenAmount: Number(data.tokenAmount) || 0,
        priceCents: Number(data.priceCents) || 0,
        currency: String(data.currency || "usd"),
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
        label: typeof data.label === "string" ? data.label : null,
      };
    });

    return NextResponse.json({ tiers });
  } catch (err) {
    console.error("GET /api/member/token-tiers error:", err);
    // Fallback without composite index: filter in memory
    try {
      const adminDb = getAdminDb();
      const snap = await adminDb.collection("tokenTopUpTiers").get();
      const tiers = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            tokenAmount: Number(data.tokenAmount) || 0,
            priceCents: Number(data.priceCents) || 0,
            currency: String(data.currency || "usd"),
            active: data.active !== false,
            sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
            label: typeof data.label === "string" ? data.label : null,
          };
        })
        .filter((t) => t.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.tokenAmount - b.tokenAmount)
        .map(({ active: _a, ...rest }) => rest);
      return NextResponse.json({ tiers });
    } catch (err2) {
      console.error("GET /api/member/token-tiers fallback error:", err2);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
  }
}
