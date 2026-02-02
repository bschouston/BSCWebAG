"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
// import { auth } from "@/lib/firebase/client";
// import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MemberDashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        async function fetchData() {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/member/tokens?limit=1", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.balance !== undefined) setBalance(data.balance);
            } catch (error) {
                console.error(error);
            }
        }
        fetchData();
    }, [user]);

    if (loading) return <div>Loading...</div>;

    // const handleLogout = async () => {
    //     await signOut(auth);
    //     router.push("/login");
    // };

    return (
        <div className="container py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Welcome, {user?.displayName}</h1>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Token Balance Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Token Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-bold">{balance}</p>
                        <Link href="/member/tokens">
                            <Button className="mt-4 w-full" variant="outline">Manage Tokens</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link href="/member/events">
                            <Button className="w-full">Browse Events</Button>
                        </Link>
                        <Link href="/member/profile">
                            <Button variant="secondary" className="w-full">Update Profile</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
