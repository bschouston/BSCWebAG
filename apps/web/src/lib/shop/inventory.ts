import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import type { ShopOrderLine, ShopVariant } from "@/lib/shop/types";
import { variantAvailable } from "@/lib/shop/types";

function applyDelta(
  variants: ShopVariant[],
  lines: ShopOrderLine[],
  delta: number
): ShopVariant[] {
  const next = variants.map((v) => ({ ...v }));
  for (const line of lines) {
    const idx = next.findIndex((v) => v.id === line.variantId);
    if (idx < 0) throw new Error(`Variant ${line.variantId} not found`);
    const v = next[idx]!;
    const reserved = Math.max(0, (v.reservedCount || 0) + delta * line.qty);
    next[idx] = { ...v, reservedCount: reserved };
  }
  return next;
}

export async function reserveVariantsInTx(
  tx: Transaction,
  adminDb: Firestore,
  lines: ShopOrderLine[]
): Promise<void> {
  const byProduct = new Map<string, ShopOrderLine[]>();
  for (const line of lines) {
    const list = byProduct.get(line.productId) ?? [];
    list.push(line);
    byProduct.set(line.productId, list);
  }

  for (const [productId, productLines] of byProduct) {
    const ref = adminDb.collection("shopProducts").doc(productId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Product ${productId} not found`);
    const data = snap.data() as { variants?: ShopVariant[]; status?: string };
    if (data.status !== "PUBLISHED") throw new Error(`Product ${productId} is not available`);
    const variants = Array.isArray(data.variants) ? data.variants : [];
    for (const line of productLines) {
      const v = variants.find((x) => x.id === line.variantId);
      if (!v) throw new Error(`Variant ${line.variantId} not found`);
      if (!variantAvailable(v, line.qty)) {
        throw new Error(`Not enough remaining for ${line.name} (${line.size}/${line.color})`);
      }
    }
    tx.update(ref, { variants: applyDelta(variants, productLines, 1) });
  }
}

export async function releaseVariants(
  adminDb: Firestore,
  lines: ShopOrderLine[]
): Promise<void> {
  const byProduct = new Map<string, ShopOrderLine[]>();
  for (const line of lines) {
    const list = byProduct.get(line.productId) ?? [];
    list.push(line);
    byProduct.set(line.productId, list);
  }

  await adminDb.runTransaction(async (tx) => {
    for (const [productId, productLines] of byProduct) {
      const ref = adminDb.collection("shopProducts").doc(productId) as DocumentReference;
      const snap = await tx.get(ref);
      if (!snap.exists) continue;
      const data = snap.data() as { variants?: ShopVariant[] };
      const variants = Array.isArray(data.variants) ? data.variants : [];
      tx.update(ref, { variants: applyDelta(variants, productLines, -1) });
    }
  });
}
