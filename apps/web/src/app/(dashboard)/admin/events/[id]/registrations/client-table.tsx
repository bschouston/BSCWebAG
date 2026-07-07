"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
    registrationIsConfirmed,
    registrationIsWaitlisted,
} from "@/lib/registration-status";

type PaymentStatus = "pending" | "paid" | "partial" | "waitlisted_no_payment";
type RegistrationStatus = "CONFIRMED" | "WAITLISTED" | "CANCELLED";

interface Registration {
    id: string;
    status?: RegistrationStatus | string;
    paymentStatus?: PaymentStatus | string;
    registeredAt?: string | null;
    firstName?: string;
    lastName?: string;
    email?: string;
    whatsappNumber?: string;
    tshirtSize?: string;
    its?: string;
    dateOfBirth?: string;
    age?: string | number;
    jamaatAffiliation?: string;
    isCaptain?: string;
    heightFeet?: string | number;
    heightInches?: string | number;
    weight?: string | number;
    strongestPosition?: string;
    playFrequency?: string;
    iceFirstName?: string;
    iceLastName?: string;
    icePhone?: string;
    foodAllergies?: string;
    injuries?: string;
    draftPitch?: string;
    interestedInTeamOwnership?: boolean;
    agreementSignature?: string;
    waiverSignature?: string;
}

function statusBadge(reg: Registration) {
    if (registrationIsWaitlisted(reg)) {
        return (
            <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300">
                Waitlisted
            </span>
        );
    }
    if (registrationIsConfirmed(reg)) {
        return (
            <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                Confirmed
            </span>
        );
    }
    const status = String(reg.status ?? "").toUpperCase();
    if (status === "CANCELLED") {
        return (
            <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
                Cancelled
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
            Pending
        </span>
    );
}

export function RegistrationClientTable({
    registrations: initialRegistrations,
    eventId,
}: {
    registrations: Registration[];
    eventId: string;
}) {
    const [registrations, setRegistrations] = useState(initialRegistrations);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const updateStatus = async (reg: Registration, nextStatus: RegistrationStatus) => {
        const prev = reg.status;
        setLoadingRows((prevRows) => ({ ...prevRows, [reg.id]: true }));
        setRegistrations((rows) =>
            rows.map((r) => (r.id === reg.id ? { ...r, status: nextStatus } : r))
        );

        try {
            const res = await fetch(`/api/admin/events/${eventId}/registrations/${reg.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });
            if (!res.ok) throw new Error("Failed to update status");
        } catch {
            setRegistrations((rows) =>
                rows.map((r) => (r.id === reg.id ? { ...r, status: prev } : r))
            );
        } finally {
            setLoadingRows((prevRows) => ({ ...prevRows, [reg.id]: false }));
        }
    };

    const togglePaymentStatus = async (e: React.MouseEvent, reg: Registration) => {
        e.stopPropagation();
        const current = String(reg.paymentStatus ?? "pending").toLowerCase();
        const isPaid = current === "paid";
        const newStatus: PaymentStatus = isPaid ? "pending" : "paid";
        const promoteFromWaitlist = registrationIsWaitlisted(reg);

        setLoadingRows((prev) => ({ ...prev, [reg.id]: true }));
        setRegistrations((prev) =>
            prev.map((r) =>
                r.id === reg.id
                    ? {
                          ...r,
                          paymentStatus: newStatus,
                          status: promoteFromWaitlist ? "CONFIRMED" : r.status,
                      }
                    : r
            )
        );

        try {
            const res = await fetch(`/api/admin/events/${eventId}/registrations/${reg.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    paymentStatus: newStatus,
                    ...(promoteFromWaitlist ? { status: "CONFIRMED" } : {}),
                }),
            });
            if (!res.ok) throw new Error("Failed to update");
        } catch {
            setRegistrations((prev) =>
                prev.map((r) =>
                    r.id === reg.id
                        ? { ...r, paymentStatus: reg.paymentStatus, status: reg.status }
                        : r
                )
            );
        } finally {
            setLoadingRows((prev) => ({ ...prev, [reg.id]: false }));
        }
    };

    const confirmedCount = registrations.filter((r) => registrationIsConfirmed(r)).length;
    const waitlistCount = registrations.filter((r) => registrationIsWaitlisted(r)).length;

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                {confirmedCount} confirmed
                {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}
            </p>
            <div className="rounded-md border overflow-x-auto bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>T-Shirt</TableHead>
                            <TableHead>Payment</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {registrations.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                    No registrations found for this event yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            registrations.map((reg) => {
                                const paymentLower = String(reg.paymentStatus ?? "pending").toLowerCase();
                                const isPaid = paymentLower === "paid";
                                const isWaitlistPayment = paymentLower.includes("waitlist");
                                const isLoading = loadingRows[reg.id];

                                return (
                                    <Fragment key={reg.id}>
                                        <TableRow
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => toggleRow(reg.id)}
                                        >
                                            <TableCell>
                                                {expandedRows[reg.id] ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {reg.registeredAt
                                                    ? new Date(reg.registeredAt).toLocaleString("en-US", {
                                                          year: "numeric",
                                                          month: "short",
                                                          day: "numeric",
                                                          hour: "numeric",
                                                          minute: "2-digit",
                                                      })
                                                    : "N/A"}
                                            </TableCell>
                                            <TableCell className="font-medium whitespace-nowrap">
                                                {reg.firstName} {reg.lastName}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    {statusBadge(reg)}
                                                    <Select
                                                        value={
                                                            registrationIsWaitlisted(reg)
                                                                ? "WAITLISTED"
                                                                : registrationIsConfirmed(reg)
                                                                  ? "CONFIRMED"
                                                                  : String(reg.status ?? "CONFIRMED").toUpperCase()
                                                        }
                                                        onValueChange={(v) =>
                                                            void updateStatus(reg, v as RegistrationStatus)
                                                        }
                                                        disabled={isLoading}
                                                    >
                                                        <SelectTrigger className="h-7 w-[120px] text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                                                            <SelectItem value="WAITLISTED">Waitlisted</SelectItem>
                                                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </TableCell>
                                            <TableCell>{reg.email}</TableCell>
                                            <TableCell>{reg.whatsappNumber}</TableCell>
                                            <TableCell>{reg.tshirtSize}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                                            isPaid
                                                                ? "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-400"
                                                                : isWaitlistPayment
                                                                  ? "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300"
                                                                  : "bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400"
                                                        }`}
                                                    >
                                                        {isPaid
                                                            ? "Paid"
                                                            : isWaitlistPayment
                                                              ? "Waitlist"
                                                              : "Pending"}
                                                    </span>
                                                    {!isWaitlistPayment && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs"
                                                            onClick={(e) => togglePaymentStatus(e, reg)}
                                                            disabled={isLoading}
                                                        >
                                                            {isLoading ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : isPaid ? (
                                                                "Mark Pending"
                                                            ) : (
                                                                "Mark Paid"
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>

                                        {expandedRows[reg.id] && (
                                            <TableRow className="bg-muted/10">
                                                <TableCell colSpan={8} className="p-0 border-b">
                                                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                                        <div className="space-y-2">
                                                            <h4 className="font-semibold text-foreground border-b pb-1">
                                                                Personal Info
                                                            </h4>
                                                            <p>
                                                                <span className="text-muted-foreground">ITS:</span>{" "}
                                                                {reg.its}
                                                            </p>
                                                            <p>
                                                                <span className="text-muted-foreground">Age/DOB:</span>{" "}
                                                                {reg.dateOfBirth || reg.age}
                                                            </p>
                                                            <p>
                                                                <span className="text-muted-foreground">Jamaat:</span>{" "}
                                                                {reg.jamaatAffiliation}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <h4 className="font-semibold text-foreground border-b pb-1">
                                                                Physical & Skills
                                                            </h4>
                                                            <p>
                                                                <span className="text-muted-foreground">Position:</span>{" "}
                                                                {reg.strongestPosition}
                                                            </p>
                                                            <p>
                                                                <span className="text-muted-foreground">Frequency:</span>{" "}
                                                                {reg.playFrequency}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                                            <h4 className="font-semibold text-foreground border-b pb-1">
                                                                Draft Pitch
                                                            </h4>
                                                            <p>{reg.draftPitch || "—"}</p>
                                                        </div>
                                                    </div>
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
        </div>
    );
}
