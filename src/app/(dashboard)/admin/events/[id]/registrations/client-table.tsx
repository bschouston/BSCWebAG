"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

export function RegistrationClientTable({ registrations }: { registrations: any[] }) {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
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
                        <TableHead>Payment</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {registrations.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                No registrations found for this event yet.
                            </TableCell>
                        </TableRow>
                    ) : (
                        registrations.map((reg) => (
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
                                        {reg.registeredAt ? new Date(reg.registeredAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A'}
                                    </TableCell>
                                    <TableCell className="font-medium whitespace-nowrap">
                                        {reg.firstName} {reg.lastName}
                                    </TableCell>
                                    <TableCell>{reg.email}</TableCell>
                                    <TableCell>{reg.whatsappNumber}</TableCell>
                                    <TableCell>{reg.tshirtSize}</TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                                            Pending
                                        </span>
                                    </TableCell>
                                </TableRow>

                                {expandedRows[reg.id] && (
                                    <TableRow className="bg-muted/10">
                                        <TableCell colSpan={7} className="p-0 border-b">
                                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
                                                <div className="space-y-2">
                                                    <h4 className="font-semibold text-foreground border-b pb-1">Personal Info</h4>
                                                    <p><span className="text-muted-foreground">ITS:</span> {reg.its}</p>
                                                    <p><span className="text-muted-foreground">Age/DOB:</span> {reg.dateOfBirth || reg.age}</p>
                                                    <p><span className="text-muted-foreground">Jamaat:</span> {reg.jamaatAffiliation}</p>
                                                    <p><span className="text-muted-foreground">Captain?:</span> {reg.isCaptain}</p>
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
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
