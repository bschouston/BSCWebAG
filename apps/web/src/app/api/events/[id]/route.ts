import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";
import { resolveEventSlug } from "@/lib/events/slugify";
import { chicagoWallToUtc } from "@/lib/chicago-time";
import { rsvpWindowForStart } from "@/lib/rsvp-window";
import { notifyEventMoved } from "@/lib/notify";
import { weeklyDetailsEditLocked, weeklyOccurrenceFinished, chicagoTimeLabel, weeklyEventTraceLabel } from "@/lib/weekly-rsvp";
import { countAssignedTeamMembers, ensureDefaultWeeklyTeams, resetWeeklyTeams } from "@/lib/weekly-event-teams";

export const dynamic = "force-dynamic";

/** Accept Firestore Timestamp, Date, or ISO string. */
function toIso(value: unknown): string | null {
    if (!value) return null;
    if (
        typeof value === "object" &&
        value !== null &&
        "toDate" in value &&
        typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function toTimestamp(value: unknown): Timestamp | null {
    if (value === null || value === undefined || value === "") return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function millisOf(value: unknown): number | null {
    if (!value) return null;
    if (
        typeof value === "object" &&
        value !== null &&
        "toMillis" in value &&
        typeof (value as { toMillis: () => number }).toMillis === "function"
    ) {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (value instanceof Date) return value.getTime();
    return null;
}

/** datetime-local (no zone) is club local time for weekly occurrences. */
function parseEventDateTime(raw: unknown, asChicago: boolean): Timestamp | null {
    if (raw === null || raw === undefined || raw === "") return null;
    const s = String(raw);
    if (asChicago && !s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
        return Timestamp.fromDate(chicagoWallToUtc(s));
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        const doc = await adminDb.collection("events").doc(id).get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        const data = doc.data();
        if (!data) return NextResponse.json({ error: "No data" }, { status: 404 });

        const event: Record<string, unknown> = {
            id: doc.id,
            ...data,
            startTime: toIso(data.startTime),
            endTime: toIso(data.endTime),
            createdAt: toIso(data.createdAt),
            registrationStart: toIso(data.registrationStart),
            registrationEnd: toIso(data.registrationEnd),
            registrationsClosedAt: toIso(data.registrationsClosedAt),
            rsvpOpensAt: toIso(data.rsvpOpensAt),
            rsvpClosesAt: toIso(data.rsvpClosesAt),
            tokensSettledAt: toIso(data.tokensSettledAt),
        };
        if (data.category === "WEEKLY_SPORTS") {
            event.teamsEnabled = Boolean(data.teamsEnabled);
            event.teamsLocked = Boolean(data.teamsLocked);
            event.teamsAnnouncedAt = toIso(data.teamsAnnouncedAt);
            const seriesId = typeof data.seriesId === "string" ? data.seriesId : "";
            if (seriesId) {
                const seriesSnap = await adminDb.collection("weeklySeries").doc(seriesId).get();
                event.seriesPaused = seriesSnap.exists ? seriesSnap.data()?.paused === true : null;
            }
        } else {
            delete event.teamsEnabled;
            delete event.teamsLocked;
            delete event.teamsAnnouncedAt;
        }

        return NextResponse.json(event);
    } catch (error) {
        console.error("Error fetching event:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        const body = await request.json();

        const updateData: Record<string, unknown> = { ...body };

        if ("slug" in body || "title" in body) {
            const resolvedSlug = resolveEventSlug(
                body.slug as string | undefined,
                body.title as string | undefined
            );
            if (!resolvedSlug) {
                return NextResponse.json({ error: "A valid slug is required" }, { status: 400 });
            }
            updateData.slug = resolvedSlug;

            const slugConflict = await adminDb
                .collection("events")
                .where("slug", "==", resolvedSlug)
                .limit(2)
                .get();
            const takenByOther = slugConflict.docs.some((doc) => doc.id !== id);
            if (takenByOther) {
                return NextResponse.json(
                    { error: "This URL is already used by another event" },
                    { status: 409 }
                );
            }
        }

        const existingSnap = await adminDb.collection("events").doc(id).get();
        if (!existingSnap.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }
        const existing = existingSnap.data() ?? {};
        const isWeekly = existing.category === "WEEKLY_SPORTS";

        if (isWeekly && weeklyOccurrenceFinished({
            category: typeof existing.category === "string" ? existing.category : null,
            status: typeof existing.status === "string" ? existing.status : null,
        })) {
            return NextResponse.json(
                {
                    error: "This occurrence is completed or cancelled and cannot be edited.",
                    code: "EVENT_FINISHED",
                },
                { status: 403 }
            );
        }

        if (isWeekly && weeklyDetailsEditLocked({
            category: existing.category,
            rsvpOpensAt: existing.rsvpOpensAt,
            rsvpClosesAt: existing.rsvpClosesAt,
            rsvpManualOverride:
                existing.rsvpManualOverride === "open" || existing.rsvpManualOverride === "closed"
                    ? existing.rsvpManualOverride
                    : null,
        })) {
            return NextResponse.json(
                {
                    error: "RSVP has opened for this week. Use Manage Event for time, location, capacity, or tokens.",
                    code: "RSVP_OPEN_USE_MANAGE",
                },
                { status: 403 }
            );
        }

        if (updateData.startTime) {
            const parsed = parseEventDateTime(updateData.startTime, isWeekly);
            if (parsed) updateData.startTime = parsed;
        }
        if (updateData.endTime) {
            const parsed = parseEventDateTime(updateData.endTime, isWeekly);
            if (parsed) updateData.endTime = parsed;
        }

        delete updateData.weekdays;
        delete updateData.rsvpOpensAmount;
        delete updateData.rsvpOpensUnit;
        delete updateData.rsvpClosesAmount;
        delete updateData.rsvpClosesUnit;
        delete updateData.untilLocal;
        delete updateData.firstStartLocal;

        // Always normalize registration window (including explicit null to clear)
        if ("registrationStart" in updateData) {
            updateData.registrationStart = toTimestamp(updateData.registrationStart);
        }
        if ("registrationEnd" in updateData) {
            updateData.registrationEnd = toTimestamp(updateData.registrationEnd);
        }

        if (updateData.recurrenceRule === "NONE") {
            updateData.recurrenceRule = null;
        }

        // Strip UI-only / non-persisted fields
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.registrationStartAsap;
        delete updateData.registrationOpenHours;
        delete updateData.registrationCloseHours;

        delete updateData.confirmedCount;
        delete updateData.waitlistCount;
        delete updateData.settlePreviewTokens;
        delete updateData.tokensSettledAt;
        delete updateData.rsvpClosedNotifiedAt;
        delete updateData.teamsLocked;
        delete updateData.teamsAnnouncedAt;
        delete updateData.confirmTeamsDisable;
        delete updateData.confirm;
        if (!isWeekly) {
            delete updateData.teamsEnabled;
        } else if ("teamsEnabled" in updateData) {
            updateData.teamsEnabled = Boolean(updateData.teamsEnabled);
        }

        if (isWeekly && updateData.teamsEnabled === false && existing.teamsEnabled) {
            const assigned = await countAssignedTeamMembers(adminDb, id);
            if (assigned > 0 && body.confirmTeamsDisable !== true && body.confirm !== true) {
                return NextResponse.json(
                    {
                        error: `${assigned} confirmed member${assigned === 1 ? " is" : "s are"} assigned to a team. Confirm to disable team management.`,
                        code: "HAS_ASSIGNMENTS",
                        assigned,
                    },
                    { status: 409 }
                );
            }
        }

        await adminDb.collection("events").doc(id).update(updateData);

        if (isWeekly && updateData.teamsEnabled === false && existing.teamsEnabled) {
            await adminDb.collection("events").doc(id).update({
                teamsLocked: false,
                teamsAnnouncedAt: null,
            });
            await resetWeeklyTeams(adminDb, id);
        }

        if (isWeekly && updateData.teamsEnabled === true) {
            await ensureDefaultWeeklyTeams(adminDb, id);
        }

        const startChanged =
            millisOf(updateData.startTime) != null &&
            millisOf(updateData.startTime) !== millisOf(existing.startTime);
        if (startChanged && isWeekly) {
            const seriesId = typeof existing.seriesId === "string" ? existing.seriesId : null;
            if (seriesId) {
                const seriesSnap = await adminDb.collection("weeklySeries").doc(seriesId).get();
                const series = seriesSnap.data();
                const start = (updateData.startTime as Timestamp).toDate();
                if (series?.rsvpOpens && series?.rsvpCloses) {
                    const window = rsvpWindowForStart(start, series.rsvpOpens, series.rsvpCloses);
                    await adminDb.collection("events").doc(id).update({
                        rsvpOpensAt: Timestamp.fromDate(window.opensAt),
                        rsvpClosesAt: Timestamp.fromDate(window.closesAt),
                    });
                }
            }
            const rsvps = await adminDb.collection("event_rsvps").where("eventId", "==", id).get();
            const startDate = (updateData.startTime as Timestamp).toDate();
            const startLabel = chicagoTimeLabel(startDate);
            for (const r of rsvps.docs) {
                const st = r.data().status;
                if (st !== "CONFIRMED" && st !== "WAITLISTED") continue;
                const uid = String(r.data().userId || "");
                if (!uid) continue;
                const u = await adminDb.collection("users").doc(uid).get();
                const email = u.data()?.email;
                if (typeof email === "string") {
                    notifyEventMoved({
                        to: email,
                        name: [u.data()?.firstName, u.data()?.lastName].filter(Boolean).join(" ") || "Member",
                        eventTitle: weeklyEventTraceLabel({
                            slug: existing.slug,
                            title: updateData.title || existing.title || "Weekly event",
                        }),
                        startLabel,
                    }).catch((e) => console.error("moved email", e));
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Update event error:", error);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        await adminDb.collection("events").doc(id).delete();
        return NextResponse.json({ success: true, message: "Event deleted" });
    } catch (error) {
        console.error("Delete event error:", error);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
