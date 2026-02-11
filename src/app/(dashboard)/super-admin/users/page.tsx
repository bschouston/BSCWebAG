"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { UserProfile } from "@/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
// import { formatDate } from "@/lib/utils";

export default function AdminUsersPage() {
    const { user, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;

        const fetchUsers = async () => {
            try {
                const token = await user?.getIdToken();
                const headers: HeadersInit = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch("/api/admin/users", { headers });

                if (res.ok) {
                    const data = await res.json();
                    setUsers(data);
                } else {
                    console.error("Failed to fetch users:", res.status, res.statusText);
                }
            } catch (error) {
                console.error("Failed to fetch users", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [user, authLoading]);

    if (loading) {
        return <div className="p-8">Loading users...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                <div className="text-sm text-muted-foreground">
                    Total Users: {users.length}
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.uid}>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {user.firstName} {user.lastName}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {user.email}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "default" : "secondary"}>
                                        {user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {(() => {
                                        if (!user.createdAt) return "N/A";
                                        try {
                                            const createdAt = user.createdAt as any;
                                            // Handle Firestore Timestamp object { seconds, nanoseconds } or { _seconds, _nanoseconds }
                                            if (typeof createdAt === 'object') {
                                                if ('seconds' in createdAt) {
                                                    return new Date(createdAt.seconds * 1000).toLocaleDateString();
                                                }
                                                if ('_seconds' in createdAt) {
                                                    return new Date(createdAt._seconds * 1000).toLocaleDateString();
                                                }
                                            }
                                            // Handle ISO string or number
                                            const date = new Date(user.createdAt as unknown as string | number | Date);
                                            return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
                                        } catch {
                                            return "N/A";
                                        }
                                    })()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="ghost" size="sm">
                                        <Link href={`/super-admin/users/${user.uid}`}>
                                            Manage
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
