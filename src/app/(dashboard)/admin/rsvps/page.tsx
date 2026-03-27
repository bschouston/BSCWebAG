"use client";

import { useEffect, useState, Fragment } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SportEvent } from "@/types";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Users, CheckCircle2, Clock, Mail, Pencil, Trash2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type PaymentStatus = "pending" | "partial" | "paid";

interface Registration {
    id: string;
    eventId: string;
    status: string;
    attended?: boolean;
    waitlistPosition?: number | null;
    createdAt?: string;
    customDetails?: Record<string, any>;
    user?: {
        firstName?: string;
        lastName?: string;
        email?: string;
        photoURL?: string;
        skillLevels?: Record<string, string>;
    };
}

const CATEGORY_LABELS: Record<string, string> = {
    WEEKLY_SPORTS: "Weekly Sports",
    MONTHLY_EVENTS: "Monthly Events",
    FEATURED_EVENTS: "Featured Events",
};

export default function ManageRegistrationsPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>("");
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [loadingRegs, setLoadingRegs] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [loadingPayment, setLoadingPayment] = useState<Record<string, boolean>>({});
    const [sendingReminders, setSendingReminders] = useState(false);
    const [reminderResult, setReminderResult] = useState<{ emailsSent: number; skipped: number } | null>(null);
    const [sendingReminderRow, setSendingReminderRow] = useState<Record<string, boolean>>({});
    const [reminderSentRow, setReminderSentRow] = useState<Record<string, boolean>>({});
    const [editOpen, setEditOpen] = useState(false);
    const [editRegId, setEditRegId] = useState<string | null>(null);
    const [editJson, setEditJson] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteRegId, setDeleteRegId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Fetch all events
    useEffect(() => {
        async function fetchEvents() {
            try {
                const token = await user?.getIdToken();
                const res = await fetch("/api/events?limit=100", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const data = await res.json();
                const sorted: SportEvent[] = (data.events || []).sort((a: SportEvent, b: SportEvent) => {
                    const order = ["FEATURED_EVENTS", "MONTHLY_EVENTS", "WEEKLY_SPORTS"];
                    return order.indexOf(a.category) - order.indexOf(b.category);
                });
                setEvents(sorted);
                if (sorted.length > 0) setSelectedEventId(sorted[0].id);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingEvents(false);
            }
        }
        fetchEvents();
    }, []);

    // Fetch registrations when event changes
    useEffect(() => {
        async function fetchRegistrations() {
            if (!selectedEventId || !user) return;
            setLoadingRegs(true);
            setExpandedRows({});
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/admin/rsvps?eventId=${selectedEventId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                setRegistrations(data.rsvps || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingRegs(false);
            }
        }
        fetchRegistrations();
    }, [selectedEventId, user]);

    const toggleRow = (id: string) =>
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

    const openEdit = (reg: Registration, e: React.MouseEvent) => {
        e.stopPropagation();
        const d = reg.customDetails || {};
        const editable = {
            firstName: d.firstName ?? "",
            lastName: d.lastName ?? "",
            email: d.email ?? "",
            whatsappNumber: d.whatsappNumber ?? "",
            its: d.its ?? "",
            jamaatAffiliation: d.jamaatAffiliation ?? "",
            dateOfBirth: d.dateOfBirth ?? "",
            studentStatus: d.studentStatus ?? "",
            tshirtSize: d.tshirtSize ?? "",
            heightFeet: d.heightFeet ?? "",
            heightInches: d.heightInches ?? "",
            weight: d.weight ?? "",
            instagramHandle: d.instagramHandle ?? "",
            isCaptain: d.isCaptain ?? "",
            playFrequency: d.playFrequency ?? "",
            strongestPosition: d.strongestPosition ?? "",
            skills: d.skills ?? undefined,
            injuries: d.injuries ?? "",
            draftPitch: d.draftPitch ?? "",
            iceFirstName: d.iceFirstName ?? "",
            iceLastName: d.iceLastName ?? "",
            icePhone: d.icePhone ?? "",
            foodAllergies: d.foodAllergies ?? "",
            interestedInTeamOwnership: d.interestedInTeamOwnership ?? false,
        };
        setEditRegId(reg.id);
        setEditJson(JSON.stringify(editable, null, 2));
        setEditError(null);
        setEditOpen(true);
    };

    const openDelete = (reg: Registration, e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteRegId(reg.id);
        setDeleteError(null);
        setDeleteOpen(true);
    };

    const saveEdit = async () => {
        if (!editRegId) return;
        setSavingEdit(true);
        setEditError(null);
        try {
            const parsed = JSON.parse(editJson);
            const token = await user?.getIdToken();
            const res = await fetch(
                `/api/admin/events/${selectedEventId}/registrations/${editRegId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ updates: parsed }),
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to save changes");

            setRegistrations(prev =>
                prev.map(r =>
                    r.id === editRegId
                        ? { ...r, customDetails: { ...(r.customDetails || {}), ...parsed } }
                        : r
                )
            );
            setEditOpen(false);
        } catch (err: any) {
            setEditError(err?.message || "Invalid JSON");
        } finally {
            setSavingEdit(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteRegId) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const token = await user?.getIdToken();
            const res = await fetch(
                `/api/admin/events/${selectedEventId}/registrations/${deleteRegId}`,
                {
                    method: "DELETE",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to delete registration");

            setRegistrations(prev => prev.filter(r => r.id !== deleteRegId));
            setDeleteOpen(false);
        } catch (err: any) {
            setDeleteError(err?.message || "Failed to delete");
        } finally {
            setDeleting(false);
        }
    };

    const togglePayment = async (reg: Registration, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!reg.customDetails) return;
        const current: PaymentStatus = reg.customDetails?.paymentStatus || "pending";
        const next: PaymentStatus = current === "paid" ? "pending" : "paid";

        setLoadingPayment(prev => ({ ...prev, [reg.id]: true }));
        setRegistrations(prev =>
            prev.map(r =>
                r.id === reg.id
                    ? { ...r, customDetails: { ...r.customDetails, paymentStatus: next } }
                    : r
            )
        );

        try {
            const token = await user?.getIdToken();
            const res = await fetch(
                `/api/admin/events/${selectedEventId}/registrations/${reg.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ paymentStatus: next }),
                }
            );
            if (!res.ok) throw new Error("Failed");
        } catch {
            // Revert
            setRegistrations(prev =>
                prev.map(r =>
                    r.id === reg.id
                        ? { ...r, customDetails: { ...r.customDetails, paymentStatus: current } }
                        : r
                )
            );
        } finally {
            setLoadingPayment(prev => ({ ...prev, [reg.id]: false }));
        }
    };

    const sendReminders = async () => {
        setSendingReminders(true);
        setReminderResult(null);
        try {
            const token = await user?.getIdToken();
            // force=true bypasses the 1-hour age check for manual admin triggers
            const res = await fetch("/api/cron/abandoned-cart?force=true", {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setReminderResult({ emailsSent: data.emailsSent ?? 0, skipped: data.skipped ?? 0 });
        } catch (err) {
            console.error("Failed to send reminders:", err);
        } finally {
            setSendingReminders(false);
        }
    };

    const sendReminderToOne = async (reg: Registration, e: React.MouseEvent) => {
        e.stopPropagation();
        setSendingReminderRow(prev => ({ ...prev, [reg.id]: true }));
        setReminderSentRow(prev => ({ ...prev, [reg.id]: false }));
        try {
            const token = await user?.getIdToken();
            const res = await fetch("/api/admin/send-reminder", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ eventId: selectedEventId, registrationId: reg.id }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed");
            }
            setReminderSentRow(prev => ({ ...prev, [reg.id]: true }));
            // Reset "Sent!" label after 3 seconds
            setTimeout(() => setReminderSentRow(prev => ({ ...prev, [reg.id]: false })), 3000);
        } catch (err) {
            console.error("Failed to send reminder:", err);
        } finally {
            setSendingReminderRow(prev => ({ ...prev, [reg.id]: false }));
        }
    };

    const selectedEvent = events.find(e => e.id === selectedEventId);
    const sportId = selectedEvent?.sportId || "";
    const isCustomForm = (reg: Registration) => !!reg.customDetails;

    const stats = {
        total: registrations.length,
        confirmed: registrations.filter(r => r.status === "CONFIRMED").length,
        pendingPayment: registrations.filter(
            r => r.customDetails && !["paid"].includes(r.customDetails.paymentStatus || "pending")
        ).length,
    };

    const exportRegistrationsCsv = () => {
        if (!selectedEvent || registrations.length === 0) return;

        const baseHeaders = [
            "eventTitle",
            "eventId",
            "registrationId",
            "entryType",
            "status",
            "paymentStatus",
            "paymentType",
            "createdAt",
            "firstName",
            "lastName",
            "email",
            "whatsappNumber",
            "its",
            "dateOfBirth",
            "jamaatAffiliation",
            "isCaptain",
            "playFrequency",
            "strongestPosition",
            "tshirtSize",
            "heightFeet",
            "heightInches",
            "weight",
            "foodAllergies",
            "injuries",
            "draftPitch",
            "interestedInTeamOwnership",
            "playerPhotoUrl",
            "playerPhotoSheetImage",
            "agreementSigned",
            "waiverSigned",
            "stripeAmountPaid",
            "stripeSessionId",
        ];

        const dynamicKeys = new Set<string>();
        registrations.forEach((reg) => {
            const d = reg.customDetails || {};
            Object.keys(d).forEach((k) => {
                if (
                    ![
                        "agreementSignature",
                        "waiverSignature",
                        ...baseHeaders,
                        "skills",
                    ].includes(k)
                ) {
                    dynamicKeys.add(k);
                }
            });
        });

        const skillKeys = ["digging", "passing", "setting", "spiking", "blocking", "serving"];
        const headers = [
            ...baseHeaders,
            ...skillKeys.map((k) => `skills_${k}`),
            ...Array.from(dynamicKeys),
        ];

        const escapeCsv = (v: unknown) => {
            const s = v === undefined || v === null ? "" : String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const rows = registrations.map((reg) => {
            const d = reg.customDetails || {};
            const photoUrl = reg.user?.photoURL || d.playerPhotoUrl || "";
            const skills = (d.skills && typeof d.skills === "object") ? d.skills as Record<string, unknown> : {};

            const row: Record<string, unknown> = {
                eventTitle: selectedEvent.title,
                eventId: reg.eventId,
                registrationId: reg.id,
                entryType: d && Object.keys(d).length > 0 ? "Form" : "RSVP",
                status: reg.status,
                paymentStatus: d.paymentStatus ?? "",
                paymentType: d.paymentType ?? "",
                createdAt: reg.createdAt ? new Date(reg.createdAt).toISOString() : "",
                firstName: reg.user?.firstName || d.firstName || "",
                lastName: reg.user?.lastName || d.lastName || "",
                email: reg.user?.email || d.email || "",
                whatsappNumber: d.whatsappNumber || "",
                its: d.its || "",
                dateOfBirth: d.dateOfBirth || d.age || "",
                jamaatAffiliation: d.jamaatAffiliation || "",
                isCaptain: d.isCaptain || "",
                playFrequency: d.playFrequency || "",
                strongestPosition: d.strongestPosition || "",
                tshirtSize: d.tshirtSize || "",
                heightFeet: d.heightFeet || "",
                heightInches: d.heightInches || "",
                weight: d.weight || "",
                foodAllergies: d.foodAllergies || "",
                injuries: d.injuries || "",
                draftPitch: d.draftPitch || "",
                interestedInTeamOwnership: d.interestedInTeamOwnership === true ? "Yes" : d.interestedInTeamOwnership === false ? "No" : "",
                playerPhotoUrl: photoUrl,
                playerPhotoSheetImage: photoUrl ? `=IMAGE("${photoUrl}")` : "",
                agreementSigned: d.agreementSignature && d.agreementSignature !== "data:," ? "Yes" : "No",
                waiverSigned: d.waiverSignature && d.waiverSignature !== "data:," ? "Yes" : "No",
                stripeAmountPaid: d.stripeAmountPaid ?? "",
                stripeSessionId: d.receiptStripeSession ?? "",
            };

            skillKeys.forEach((k) => {
                row[`skills_${k}`] = skills[k] ?? "";
            });

            dynamicKeys.forEach((k) => {
                if (row[k] === undefined) {
                    const val = d[k];
                    row[k] = Array.isArray(val) ? val.join("; ") : typeof val === "object" && val !== null ? JSON.stringify(val) : val ?? "";
                }
            });

            return headers.map((h) => escapeCsv(row[h])).join(",");
        });

        const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slug = selectedEvent.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        a.href = url;
        a.download = `registrations-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const getSkillLevel = (skillLevels?: Record<string, string>) => {
        if (!skillLevels) return "-";
        const match = Object.entries(skillLevels).find(
            ([k]) => k.toLowerCase() === sportId.toLowerCase()
        );
        return match ? String(match[1]) : "-";
    };

    if (loadingEvents) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Manage Registrations</h1>
                    <p className="text-muted-foreground mt-1">
                        View and manage registrations across all events.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportRegistrationsCsv}
                        disabled={registrations.length === 0 || loadingRegs}
                        className="gap-2"
                    >
                        <Download className="h-4 w-4" />
                        Export CSV (Sheets/Excel)
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={sendReminders}
                        disabled={sendingReminders}
                        className="gap-2"
                    >
                        {sendingReminders ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Mail className="h-4 w-4" />
                        )}
                        Send Pending Payment Reminders
                    </Button>
                    {reminderResult !== null && (
                        <p className="text-xs text-muted-foreground">
                            {reminderResult.emailsSent === 0
                                ? "No pending registrations with email on file."
                                : `${reminderResult.emailsSent} reminder${reminderResult.emailsSent !== 1 ? "s" : ""} sent${reminderResult.skipped > 0 ? `, ${reminderResult.skipped} skipped` : ""}.`}
                        </p>
                    )}
                </div>
            </div>

            {/* Event Selector */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="flex-1 max-w-sm">
                            <label className="text-sm font-medium mb-1.5 block">Select Event</label>
                            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose an event..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {events.map(e => (
                                        <SelectItem key={e.id} value={e.id}>
                                            <span className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    [{CATEGORY_LABELS[e.category] || e.category}]
                                                </span>
                                                {e.title}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-5 sm:mt-0 self-end"
                            onClick={() => setSelectedEventId(prev => { const tmp = ""; return prev; })}
                            disabled={loadingRegs}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loadingRegs ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            {selectedEventId && !loadingRegs && (
                <div className="grid grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6 flex items-center gap-3">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="text-2xl font-bold">{stats.confirmed}</p>
                                <p className="text-xs text-muted-foreground">Confirmed</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 flex items-center gap-3">
                            <Clock className="h-5 w-5 text-yellow-500" />
                            <div>
                                <p className="text-2xl font-bold">{stats.pendingPayment}</p>
                                <p className="text-xs text-muted-foreground">Pending Payment</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Registrations Table */}
            <Card>
                <CardHeader>
                    <CardTitle>{selectedEvent?.title || "Select an event"}</CardTitle>
                    <CardDescription>
                        {selectedEvent
                            ? `${CATEGORY_LABELS[selectedEvent.category] || selectedEvent.category} — ${registrations.length} registration${registrations.length !== 1 ? "s" : ""}`
                            : "Choose an event above to view its registrations."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-b-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px]" />
                                    <TableHead>Date</TableHead>
                                    <TableHead>Participant</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Payment</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingRegs ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center">
                                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : registrations.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            {selectedEventId
                                                ? "No registrations for this event yet."
                                                : "Select an event to view registrations."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    registrations.map(reg => {
                                        const isCustom = isCustomForm(reg);
                                        const paymentStatus: PaymentStatus =
                                            reg.customDetails?.paymentStatus || "pending";
                                        const isPaid = paymentStatus === "paid";
                                        const isPartial = paymentStatus === "partial";
                                        const installmentsPaid: number = reg.customDetails?.installmentsPaid ?? 0;
                                        const totalInstallments: number = reg.customDetails?.totalInstallments ?? 3;
                                        const isInstallment = reg.customDetails?.paymentType === "installment";
                                        const isPaymentLoading = loadingPayment[reg.id];
                                        const firstName = reg.user?.firstName || reg.customDetails?.firstName || "";
                                        const lastName = reg.user?.lastName || reg.customDetails?.lastName || "";
                                        const email = reg.user?.email || reg.customDetails?.email || "";
                                        const photoURL = reg.user?.photoURL || reg.customDetails?.playerPhotoUrl || "";

                                        return (
                                            <Fragment key={reg.id}>
                                                <TableRow
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => toggleRow(reg.id)}
                                                >
                                                    <TableCell>
                                                        {expandedRows[reg.id]
                                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-sm">
                                                        {reg.createdAt
                                                            ? new Date(reg.createdAt).toLocaleString("en-US", {
                                                                  month: "short", day: "numeric",
                                                                  year: "numeric", hour: "numeric", minute: "2-digit",
                                                              })
                                                            : "N/A"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={photoURL} />
                                                                <AvatarFallback>
                                                                    {firstName?.[0]}{lastName?.[0]}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="font-medium text-sm">{firstName} {lastName}</p>
                                                                <p className="text-xs text-muted-foreground">{email}</p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs">
                                                            {isCustom ? "Form" : "RSVP"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={reg.status === "CONFIRMED" ? "default" : "secondary"}
                                                            className="text-xs"
                                                        >
                                                            {reg.status}
                                                            {reg.waitlistPosition ? ` #${reg.waitlistPosition}` : ""}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {isCustom ? (
                                                            <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                                                    isPaid
                                                                        ? "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-400"
                                                                        : isPartial
                                                                        ? "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-400"
                                                                        : "bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400"
                                                                }`}>
                                                                    {isPaid
                                                                        ? isInstallment ? `Paid (3/3)` : "Paid"
                                                                        : isPartial
                                                                        ? `Partial (${installmentsPaid}/${totalInstallments})`
                                                                        : "Pending"}
                                                                </span>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-6 px-2 text-xs"
                                                                    onClick={e => togglePayment(reg, e)}
                                                                    disabled={isPaymentLoading}
                                                                >
                                                                    {isPaymentLoading
                                                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                        : isPaid ? "Mark Pending" : "Mark Paid"}
                                                                </Button>
                                                                {!isPaid && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className={`h-6 px-2 text-xs gap-1 ${reminderSentRow[reg.id] ? "text-green-600" : "text-muted-foreground hover:text-foreground"}`}
                                                                        onClick={e => sendReminderToOne(reg, e)}
                                                                        disabled={sendingReminderRow[reg.id]}
                                                                    >
                                                                        {sendingReminderRow[reg.id] ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : reminderSentRow[reg.id] ? (
                                                                            <><CheckCircle2 className="h-3 w-3" /> Sent!</>
                                                                        ) : (
                                                                            <><Mail className="h-3 w-3" /> Remind</>
                                                                        )}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">Token-based</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>

                                                {/* Expanded Detail Row */}
                                                {expandedRows[reg.id] && (
                                                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                                                        <TableCell colSpan={6} className="p-0 border-b">
                                                            {isCustom ? (
                                                                <CustomFormDetails reg={reg} onEdit={openEdit} onDelete={openDelete} />
                                                            ) : (
                                                                <RSVPDetails reg={reg} sportId={sportId} getSkillLevel={getSkillLevel} />
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Registration</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Edit the JSON and save. Only allowed fields will be updated.
                        </p>
                        <Textarea
                            value={editJson}
                            onChange={(e) => setEditJson(e.target.value)}
                            className="min-h-[320px] font-mono text-xs"
                        />
                        {editError && <p className="text-sm text-destructive">{editError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                            Cancel
                        </Button>
                        <Button onClick={saveEdit} disabled={savingEdit}>
                            {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete registration?</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            This will permanently delete the registration record. This action cannot be undone.
                        </p>
                        {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ── Expanded detail panels ─────────────────────────────────────────────────

function CustomFormDetails({
    reg,
    onEdit,
    onDelete,
}: {
    reg: Registration;
    onEdit: (reg: Registration, e: React.MouseEvent) => void;
    onDelete: (reg: Registration, e: React.MouseEvent) => void;
}) {
    const d = reg.customDetails || {};

    // Build a flat list of fields, filtering out system/signature fields and empty values
    const skip = new Set(["agreementSignature", "waiverSignature", "registeredAt", "paymentStatus"]);
    const isEmptyValue = (v: unknown) => {
        if (v === undefined || v === null) return true;
        if (typeof v === "string") return v.trim().length === 0;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
        return false;
    };

    const fields = Object.entries(d).filter(([k, v]) => !skip.has(k) && !isEmptyValue(v));

    // Group the known volleyball fields, fallback to raw key/value dump for other event types
    const knownGroups = [
        {
            title: "Personal Info",
            keys: ["firstName", "lastName", "email", "whatsappNumber", "its", "dateOfBirth", "age", "jamaatAffiliation"],
        },
        {
            title: "Physical & Skills",
            keys: ["tshirtSize", "heightFeet", "heightInches", "weight", "strongestPosition", "playFrequency", "isCaptain"],
        },
        {
            title: "Emergency Contact",
            keys: ["iceFirstName", "iceLastName", "icePhone", "foodAllergies", "injuries"],
        },
        {
            title: "Draft Pitch",
            keys: ["draftPitch"],
        },
    ];

    const knownKeys = new Set(knownGroups.flatMap(g => g.keys));
    const unknownFields = fields.filter(([k]) => !knownKeys.has(k));

    const label = (k: string) =>
        k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());

    const renderValue = (k: string, v: unknown) => {
        if (k === "skills" && v && typeof v === "object" && !Array.isArray(v)) {
            const entries = Object.entries(v as Record<string, unknown>);
            return (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                    {entries.map(([sk, sv]) => (
                        <span key={sk} className="whitespace-nowrap">
                            <span className="font-medium text-foreground">{label(sk)}:</span>{" "}
                            {String(sv)}
                        </span>
                    ))}
                </div>
            );
        }

        if (Array.isArray(v)) return v.join(", ");
        if (typeof v === "object") return JSON.stringify(v, null, 0);
        if (typeof v === "boolean") return v ? "Yes" : "No";
        return String(v);
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={(e) => onEdit(reg, e)}>
                    <Pencil className="h-4 w-4" />
                    Edit Registration
                </Button>
                <Button variant="destructive" size="sm" className="gap-2" onClick={(e) => onDelete(reg, e)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            {knownGroups.map(group => {
                const groupFields = group.keys
                    .map(k => [k, d[k]])
                    .filter(([, v]) => !isEmptyValue(v));
                if (groupFields.length === 0) return null;
                return (
                    <div key={group.title} className="space-y-1.5">
                        <h4 className="font-semibold text-foreground border-b pb-1 mb-2">{group.title}</h4>
                        {groupFields.map(([k, v]) => (
                            <p key={String(k)} className="break-words">
                                <span className="text-muted-foreground">{label(String(k))}: </span>
                                <span className="break-words whitespace-pre-wrap">
                                    {renderValue(String(k), v)}
                                </span>
                            </p>
                        ))}
                    </div>
                );
            })}

            {/* Unknown / extra fields for non-volleyball events */}
            {unknownFields.length > 0 && (
                <div className="space-y-1.5">
                    <h4 className="font-semibold text-foreground border-b pb-1 mb-2">Additional Info</h4>
                    {unknownFields.map(([k, v]) => (
                        <p key={String(k)} className="break-words">
                            <span className="text-muted-foreground">{label(String(k))}: </span>
                            <span className="break-words whitespace-pre-wrap">
                                {renderValue(String(k), v)}
                            </span>
                        </p>
                    ))}
                </div>
            )}

            {/* Signatures */}
            <div className="space-y-1.5">
                <h4 className="font-semibold text-foreground border-b pb-1 mb-2">Signatures</h4>
                {["agreementSignature", "waiverSignature"].map(sigKey => (
                    <p key={sigKey}>
                        <span className="text-muted-foreground">{label(sigKey)}: </span>
                        {d[sigKey] && d[sigKey] !== "data:," ? (
                            <span className="text-green-600 font-medium">Signed</span>
                        ) : (
                            <span className="text-destructive font-medium">Missing</span>
                        )}
                    </p>
                ))}
            </div>
            </div>
        </div>
    );
}

function RSVPDetails({
    reg,
    sportId,
    getSkillLevel,
}: {
    reg: Registration;
    sportId: string;
    getSkillLevel: (s?: Record<string, string>) => string;
}) {
    return (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-1.5">
                <h4 className="font-semibold text-foreground border-b pb-1 mb-2">RSVP Details</h4>
                <p><span className="text-muted-foreground">Status: </span>{reg.status}</p>
                <p><span className="text-muted-foreground">Waitlist Position: </span>{reg.waitlistPosition ?? "—"}</p>
                <p><span className="text-muted-foreground">Attended: </span>{reg.attended ? "Yes" : "No"}</p>
            </div>
            <div className="space-y-1.5">
                <h4 className="font-semibold text-foreground border-b pb-1 mb-2">Skill Level</h4>
                <p>
                    <span className="text-muted-foreground">{sportId || "Sport"}: </span>
                    {getSkillLevel(reg.user?.skillLevels)}
                </p>
            </div>
        </div>
    );
}
