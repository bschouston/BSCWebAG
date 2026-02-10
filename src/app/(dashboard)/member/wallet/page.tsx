"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function WalletPage() {
    const { profile, loading } = useAuth();

    // Mock Transaction Data (Replace with real data fetch later)
    const transactions = [
        { id: "tx_1", type: "DEBIT", amount: 2, description: "Event Registration: Badminton Weekly", date: "2024-02-08", status: "COMPLETED" },
        { id: "tx_2", type: "CREDIT", amount: 20, description: "Top Up: Starter Pack", date: "2024-02-01", status: "COMPLETED" },
        { id: "tx_3", type: "DEBIT", amount: 3, description: "Event Registration: Volleyball Tournament", date: "2024-01-28", status: "COMPLETED" },
    ];

    if (loading) return <div>Loading wallet...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">My Wallet</h1>

            {/* Balance Card */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Token Balance
                        </CardTitle>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            className="h-4 w-4 text-muted-foreground"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 8v8" />
                        </svg>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold">{profile?.tokenBalance || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Available for event registration
                        </p>
                        <div className="mt-4 flex space-x-2">
                            <Link href="/member/shop">
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" /> Top Up
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                {/* Active Subscriptions Card */}
                <Card className="col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Subscription
                        </CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-semibold">None Active</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Enable auto-replenish to never run out of tokens.
                        </p>
                        <div className="mt-4">
                            <Link href="/member/shop">
                                <Button variant="outline" size="sm">
                                    View Plans
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="transactions" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                    <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
                </TabsList>

                {/* Transactions Tab */}
                <TabsContent value="transactions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>
                                Recent activity on your account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell>
                                                <div className="flex items-center">
                                                    {tx.type === "CREDIT" ? (
                                                        <ArrowDownLeft className="mr-2 h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <ArrowUpRight className="mr-2 h-4 w-4 text-red-500" />
                                                    )}
                                                    <span className={tx.type === "CREDIT" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                                        {tx.type}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{tx.description}</TableCell>
                                            <TableCell className="font-bold">{tx.amount}</TableCell>
                                            <TableCell>{tx.date}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline">{tx.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Payment Methods Tab */}
                <TabsContent value="payment-methods" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Saved Cards</CardTitle>
                            <CardDescription>
                                Manage your payment methods for purchases and subscriptions.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Placeholder for saved cards */}
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex items-center space-x-4">
                                    <div className="h-10 w-16 bg-muted rounded flex items-center justify-center">
                                        <CreditCard className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Visa ending in 4242</p>
                                        <p className="text-sm text-muted-foreground">Expires 12/26</p>
                                    </div>
                                </div>
                                <Badge variant="secondary">Default</Badge>
                            </div>

                            <Button variant="outline" className="w-full border-dashed" onClick={() => alert("Add card flow")}>
                                <Plus className="mr-2 h-4 w-4" /> Add New Card
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
