"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

type PaymentStatus = "pending" | "paid";

interface Registration {
    id: string;
    paymentStatus?: PaymentStatus;
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
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const togglePaymentStatus = async (e: React.MouseEvent, reg: Registration) => {
        e.stopPropagation();
        const newStatus: PaymentStatus = reg.paymentStatus === "paid" ? "pending" : "paid";

        setLoadingRows(prev => ({ ...prev, [reg.id]: true }));
        setRegistrations(prev =>
            prev.map(r => (r.id === reg.id ? { ...r, paymentStatus: newStatus } : r))
        );

        try {
            const res = await fetch(
                `/api/admin/events/${eventId}/registrations/${reg.id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentStatus: newStatus }),
                }
            );
            if (!res.ok) throw new Error("Failed to update");
        } catch {
            // Revert on failure
            setRegistrations(prev =>
                prev.map(r =>
                    r.id === reg.id ? { ...r, paymentStatus: reg.paymentStatus } : r
                )
            );
        } finally {
            setLoadingRows(prev => ({ ...prev, [reg.id]: false }));
        }
    };

    return (
        <div className="rounded-md border overflow-x-auto bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>T-Shirt</TableHead>
                        <TableHead>Team Owner</TableHead>
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
                            const isPaid = reg.paymentStatus === "paid";
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
                                        <TableCell>{reg.email}</TableCell>
                                        <TableCell>{reg.whatsappNumber}</TableCell>
                                        <TableCell>{reg.tshirtSize}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                                reg.interestedInTeamOwnership
                                                    ? "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-400"
                                                    : "bg-muted text-muted-foreground ring-border"
                                            }`}>
                                                {reg.interestedInTeamOwnership ? "Yes" : "No"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                                        isPaid
                                                            ? "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-400"
                                                            : "bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400"
                                                    }`}
                                                >
                                                    {isPaid ? "Paid" : "Pending"}
                                                </span>
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
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {expandedRows[reg.id] && (
                                        <TableRow className="bg-muted/10">
                                            <TableCell colSpan={8} className="p-0 border-b">
                                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                                    <div className="space-y-2">
                                                        <h4 className="font-semibold text-foreground border-b pb-1">Personal Info</h4>
                                                        <p><span className="text-muted-foreground">ITS:</span> {reg.its}</p>
                                                        <p><span className="text-muted-foreground">Age/DOB:</span> {reg.dateOfBirth || reg.age}</p>
                                                        <p><span className="text-muted-foreground">Jamaat:</span> {reg.jamaatAffiliation}</p>
                                                        <p><span className="text-muted-foreground">Captain?:</span> {reg.isCaptain}</p>
                                                        <p><span className="text-muted-foreground">Team Ownership:</span> {reg.interestedInTeamOwnership ? "Yes" : "No"}</p>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="font-semibold text-foreground border-b pb-1">Physical & Skills</h4>
                                                        <p><span className="text-muted-foreground">Height:</span> {reg.heightFeet}&apos;{reg.heightInches}&quot;</p>
                                                        <p><span className="text-muted-foreground">Weight:</span> {reg.weight} lbs</p>
                                                        <p><span className="text-muted-foreground">Position:</span> {reg.strongestPosition}</p>
                                                        <p><span className="text-muted-foreground">Frequency:</span> {reg.playFrequency}</p>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="font-semibold text-foreground border-b pb-1">Emergency & Health</h4>
                                                        <p><span className="text-muted-foreground">ICE Name:</span> {reg.iceFirstName} {reg.iceLastName}</p>
                                                        <p><span className="text-muted-foreground">ICE Phone:</span> {reg.icePhone}</p>
                                                        <p><span className="text-muted-foreground">Allergies:</span> {reg.foodAllergies || "None"}</p>
                                                        <p><span className="text-muted-foreground">Injuries:</span> {reg.injuries || "None"}</p>
                                                    </div>

                                                    <div className="space-y-2 md:col-span-2 lg:col-span-3">
                                                        <h4 className="font-semibold text-foreground border-b pb-1">Signatures & Pitch</h4>
                                                        <p><span className="text-muted-foreground">Draft Pitch:</span> {reg.draftPitch}</p>
                                                        <div className="flex gap-8 mt-2">
                                                            <div>
                                                                <span className="text-muted-foreground">Agreement: </span>
                                                                {reg.agreementSignature && reg.agreementSignature !== "data:," ? (
                                                                    <span className="text-green-600 font-medium">Signed</span>
                                                                ) : (
                                                                    <span className="text-destructive font-medium">Missing</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground">Waiver: </span>
                                                                {reg.waiverSignature && reg.waiverSignature !== "data:," ? (
                                                                    <span className="text-green-600 font-medium">Signed</span>
                                                                ) : (
                                                                    <span className="text-destructive font-medium">Missing</span>
                                                                )}
                                                            </div>
                                                        </div>
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
    );
}
