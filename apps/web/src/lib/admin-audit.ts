import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export async function writeAdminAudit(entry: {
  adminUid: string;
  targetUid: string;
  action: string;
  meta?: Record<string, unknown>;
}) {
  const adminDb = getAdminDb();
  await adminDb.collection("adminAudit").add({
    adminUid: entry.adminUid,
    targetUid: entry.targetUid,
    action: entry.action,
    meta: entry.meta ?? {},
    at: FieldValue.serverTimestamp(),
  });
}
