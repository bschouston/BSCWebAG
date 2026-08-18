import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type TokenPricingConfig = {
  unitPriceCents: number;
  currency: string;
};

export async function getTokenPricingConfig(): Promise<TokenPricingConfig> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tokenPricingConfig").doc("default").get();
  if (!snap.exists) {
    return { unitPriceCents: 0, currency: "usd" };
  }
  const data = snap.data() ?? {};
  return {
    unitPriceCents: Number(data.unitPriceCents) || 0,
    currency: String(data.currency || "usd"),
  };
}

export async function saveTokenPricingConfig(opts: {
  unitPriceCents: number;
  currency?: string;
}): Promise<void> {
  const adminDb = getAdminDb();
  await adminDb
    .collection("tokenPricingConfig")
    .doc("default")
    .set(
      {
        unitPriceCents: opts.unitPriceCents,
        currency: (opts.currency || "usd").toLowerCase(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
}
