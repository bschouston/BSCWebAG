import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePackageCardColor } from "@/lib/token-packages";
import { getTokenPricingConfig } from "@/lib/token-pricing-config";

export const dynamic = "force-dynamic";

/** Member: active token packages + unit pricing. */
export async function GET() {
  try {
    const adminDb = getAdminDb();
    const [snap, pricing] = await Promise.all([
      adminDb.collection("tokenPackages").get(),
      getTokenPricingConfig(),
    ]);
    const packages = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          tokenAmount: Number(data.tokenAmount) || 0,
          priceCents: Number(data.priceCents) || 0,
          currency: String(data.currency || "usd"),
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
          label: typeof data.label === "string" ? data.label : null,
          cardColor: normalizePackageCardColor(data.cardColor),
          active: data.active !== false,
        };
      })
      .filter((p) => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.tokenAmount - b.tokenAmount)
      .map(({ active: _active, ...rest }) => rest);

    return NextResponse.json({
      packages,
      pricing: {
        unitPriceCents: pricing.unitPriceCents,
        currency: pricing.currency,
      },
    });
  } catch (err) {
    console.error("GET /api/member/token-packages error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
