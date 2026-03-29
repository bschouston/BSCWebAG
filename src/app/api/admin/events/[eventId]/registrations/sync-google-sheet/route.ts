import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { appendVolleyballRegistrationRowsBatch, isGoogleSheetsConfigured } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
/** Allow long backfills on Vercel (Pro / Fluid compute). Hobby may still cap lower. */
export const maxDuration = 300;

function sheetsErrorHint(status: number, bodyText: string): string {
    const lower = bodyText.toLowerCase();
    if (status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
        return "Share the spreadsheet with your service account email (the client_email inside GOOGLE_SERVICE_ACCOUNT_JSON) as Editor. Confirm Google Sheets API is enabled for that GCP project.";
    }
    if (status === 404 || lower.includes("not found")) {
        return "Check GOOGLE_SHEET_ID (spreadsheet ID from the URL) and GOOGLE_SHEET_TAB (exact tab name, case-sensitive).";
    }
    if (lower.includes("invalid_grant") || lower.includes("invalid jwt")) {
        return "GOOGLE_SERVICE_ACCOUNT_JSON may be malformed or the private key may be wrong. Re-copy the JSON as one line in .env.local.";
    }
    return "See server terminal logs for the full Google API response.";
}

/**
 * One-off backfill: append each non-draft registration without googleSheetsSyncedAt
 * to the configured volleyball Google Sheet, then mark the doc as synced.
 * Body (optional JSON): { forceResyncAll?: true } — append every non-draft row again (duplicates in sheet if already present).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ eventId: string }> }
) {
    const started = Date.now();
    const { error } = await requireAdmin(request);
    if (error) return error;

    let forceResyncAll = false;
    try {
        const ct = request.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
            const body = (await request.json()) as { forceResyncAll?: boolean };
            forceResyncAll = body.forceResyncAll === true;
        }
    } catch {
        // empty body is fine
    }

    if (!isGoogleSheetsConfigured()) {
        return NextResponse.json(
            {
                error:
                    "Google Sheets is not configured (GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID, GOOGLE_SHEET_TAB).",
            },
            { status: 400 }
        );
    }

    try {
        const { eventId } = await params;

        const eventSnap = await adminDb.collection("events").doc(eventId).get();
        if (!eventSnap.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        const eventData = eventSnap.data();
        if (eventData?.registrationFormType !== "volleyball") {
            return NextResponse.json(
                {
                    error: "Google Sheet backfill is only available for volleyball registration events.",
                },
                { status: 400 }
            );
        }

        const eventTitle = eventData?.title ?? "";

        const snapshot = await adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .get();

        const docs = snapshot.docs
            .filter((d) => d.data().isDraft !== true)
            .sort((a, b) => {
                const ta = a.data().registeredAt?.toMillis?.() ?? 0;
                const tb = b.data().registeredAt?.toMillis?.() ?? 0;
                return ta - tb;
            });

        const result = {
            synced: 0,
            skipped: 0,
            failed: [] as { id: string; message: string }[],
        };

        const toSyncDocs: typeof docs = [];
        for (const doc of docs) {
            const data = doc.data();
            if (data.googleSheetsSyncedAt && !forceResyncAll) {
                result.skipped++;
            } else {
                toSyncDocs.push(doc);
            }
        }

        console.info(
            `[sync-google-sheet] event=${eventId} forceResyncAll=${forceResyncAll} toSync=${toSyncDocs.length} skipped=${result.skipped}`
        );

        if (toSyncDocs.length === 0) {
            console.info(`[sync-google-sheet] done in ${Date.now() - started}ms — nothing to sync`);
            return NextResponse.json(result);
        }

        const inputs = toSyncDocs.map((doc) => {
            const data = doc.data();
            const amountPaid =
                typeof data.stripeAmountPaid === "number" ? data.stripeAmountPaid : 0;
            const stripeSessionId =
                typeof data.receiptStripeSession === "string" ? data.receiptStripeSession : "";
            return {
                reg: data as Record<string, unknown>,
                eventId,
                registrationId: doc.id,
                eventTitle,
                amountPaid,
                stripeSessionId,
            };
        });

        const tSheets = Date.now();
        try {
            await appendVolleyballRegistrationRowsBatch(inputs);
            console.info(`[sync-google-sheet] Google append OK in ${Date.now() - tSheets}ms (${inputs.length} rows)`);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[sync-google-sheet] batch append failed:", e);
            const statusMatch = message.match(/\((\d{3})\)/);
            const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 502;
            const hint = sheetsErrorHint(httpStatus, message);
            return NextResponse.json(
                {
                    error: message,
                    hint,
                    synced: 0,
                    skipped: result.skipped,
                    failed: [],
                },
                { status: 502 }
            );
        }

        const FIRESTORE_BATCH = 500;
        const tFs = Date.now();
        try {
            for (let i = 0; i < toSyncDocs.length; i += FIRESTORE_BATCH) {
                const batch = adminDb.batch();
                const slice = toSyncDocs.slice(i, i + FIRESTORE_BATCH);
                for (const doc of slice) {
                    batch.update(doc.ref, {
                        googleSheetsSyncedAt: FieldValue.serverTimestamp(),
                    });
                }
                await batch.commit();
            }
            result.synced = toSyncDocs.length;
            console.info(`[sync-google-sheet] Firestore OK in ${Date.now() - tFs}ms — total ${Date.now() - started}ms`);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[sync-google-sheet] Firestore batch:", e);
            return NextResponse.json(
                {
                    error: `Rows were appended to Google Sheets but Firestore could not be updated: ${message}`,
                    synced: 0,
                    skipped: result.skipped,
                    failed: [],
                },
                { status: 500 }
            );
        }

        console.info(
            `[sync-google-sheet] success synced=${result.synced} skipped=${result.skipped} totalMs=${Date.now() - started}`
        );
        return NextResponse.json({ ...result, forceResyncAll });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Backfill failed";
        console.error("[sync-google-sheet] unexpected:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
