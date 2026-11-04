import type { Firestore } from "firebase-admin/firestore";
import type { ShopVariant } from "@/lib/shop/types";

export const SKU_MAX_LEN = 12;

/** Uppercase alphanumeric only, max 12. */
export function normalizeSku(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, SKU_MAX_LEN);
}

function cleanToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isNumericToken(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Initial SKU from product name + size (+ optional color), ≤12 chars.
 * Takes a short stem from each name word (e.g. Argentina 1998 Jersey + XS → ARG1998JERXS).
 */
export function suggestSku(name: string, size: string, color = ""): string {
  const sizePart = cleanToken(size).slice(0, 3);
  const colorPart = cleanToken(color).slice(0, 3);
  const reserved = sizePart.length + colorPart.length;
  const nameBudget = Math.max(0, SKU_MAX_LEN - reserved);

  const words = name
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .map(cleanToken)
    .filter(Boolean);

  if (!words.length && !sizePart && !colorPart) return "SKU";

  // Start with ~3 letters per word (keep numbers up to 4), then fit to budget.
  const chunks = words.map((w) => (isNumericToken(w) ? w.slice(0, 4) : w.slice(0, 3)));

  const totalLen = () => chunks.reduce((n, c) => n + c.length, 0);

  // Grow alpha stems toward 4 if we still have room.
  while (totalLen() < nameBudget) {
    let grew = false;
    for (let i = 0; i < chunks.length; i++) {
      const full = words[i]!;
      if (isNumericToken(full)) continue;
      if (chunks[i]!.length >= full.length || chunks[i]!.length >= 4) continue;
      if (totalLen() >= nameBudget) break;
      chunks[i] = full.slice(0, chunks[i]!.length + 1);
      grew = true;
    }
    if (!grew) break;
  }

  // Shrink if over budget: trim longest alpha stems first, then numbers.
  while (totalLen() > nameBudget && chunks.some((c) => c.length > 0)) {
    let idx = -1;
    let best = 0;
    for (let i = 0; i < chunks.length; i++) {
      const full = words[i]!;
      const len = chunks[i]!.length;
      if (len <= (isNumericToken(full) ? 2 : 1)) continue;
      if (len > best) {
        best = len;
        idx = i;
      }
    }
    if (idx < 0) {
      // Last resort: drop from the end of the joined name part.
      break;
    }
    chunks[idx] = chunks[idx]!.slice(0, -1);
  }

  let namePart = chunks.join("");
  if (namePart.length > nameBudget) namePart = namePart.slice(0, nameBudget);

  return normalizeSku(`${namePart}${sizePart}${colorPart}`) || "SKU";
}

/** Pick a unique SKU ≤12 chars, appending 2,3,… on collision. */
export function allocateUniqueSku(base: string, used: Set<string>): string {
  const stem = normalizeSku(base) || "SKU";
  if (!used.has(stem)) return stem;
  for (let i = 2; i < 10000; i++) {
    const suffix = String(i);
    const head = stem.slice(0, Math.max(1, SKU_MAX_LEN - suffix.length));
    const candidate = normalizeSku(`${head}${suffix}`);
    if (candidate && !used.has(candidate)) return candidate;
  }
  throw new Error("Unable to allocate a unique SKU");
}

export function collectSkusFromVariants(variants: ShopVariant[]): string[] {
  return variants
    .map((v) => normalizeSku(v.sku ?? ""))
    .filter((s) => s.length > 0);
}

/** All SKUs across every shop product (draft / published / archived). */
export async function loadUsedShopSkus(
  adminDb: Firestore,
  excludeProductId?: string
): Promise<Set<string>> {
  const snap = await adminDb.collection("shopProducts").get();
  const used = new Set<string>();
  for (const doc of snap.docs) {
    if (excludeProductId && doc.id === excludeProductId) continue;
    const data = doc.data() as { variants?: unknown };
    const variants = Array.isArray(data.variants) ? data.variants : [];
    for (const raw of variants) {
      if (!raw || typeof raw !== "object") continue;
      const sku = normalizeSku(String((raw as { sku?: unknown }).sku ?? ""));
      if (sku) used.add(sku);
    }
  }
  return used;
}

/**
 * Ensures every variant has a non-empty SKU ≤12, unique within the batch
 * and against `usedOutside` (other products). Mutates nothing — returns copy.
 */
export function enforceVariantSkus(
  variants: ShopVariant[],
  usedOutside: Set<string>,
  productName: string
): { variants: ShopVariant[]; error?: string } {
  const used = new Set(usedOutside);
  const out: ShopVariant[] = [];

  for (const v of variants) {
    let sku = normalizeSku(v.sku ?? "");
    if (!sku) {
      sku = allocateUniqueSku(suggestSku(productName, v.size, v.color), used);
    }
    if (sku.length > SKU_MAX_LEN) {
      return { variants: [], error: `SKU “${sku}” exceeds ${SKU_MAX_LEN} characters` };
    }
    if (used.has(sku)) {
      return {
        variants: [],
        error: `SKU “${sku}” is already used by another variant or product`,
      };
    }
    used.add(sku);
    out.push({ ...v, sku });
  }

  return { variants: out };
}
