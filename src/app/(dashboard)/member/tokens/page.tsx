"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TokenTransaction } from "@/types";
import { ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react";

export default function TokenManagementPage() {
    const { user, loading } = useAuth();
    const [balance, setBalance] = useState<number>(0);
    const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        async function fetchTokens() {
            try {
                const token = await user?.getIdToken();
                if (!token) return;

                const res = await fetch("/api/member/tokens", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                const data = await res.json();

                if (data.balance !== undefined) {
                    setBalance(data.balance);
                    setTransactions(data.transactions || []);
                }
            } catch (error) {
                console.error("Failed to fetch token data", error);
            } finally {
                setIsLoadingData(false);
            }
        }

        if (user) {
            fetchTokens();
        }
    }, [user]);

    if (loading || isLoadingData) {
        return <div className="p-8 text-center text-muted-foreground">Loading token history...</div>;
    }

    return (
        <div className="container py-8 max-w-4xl">
            <h1 className="text-3xl font-bold mb-8">My Tokens</h1>

            <div className="grid gap-8 md:grid-cols-[1fr_2fr]">

                {/* Balance Card */}
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Coins className="h-5 w-5 text-yellow-500" />
                            Current Balance
                        </CardTitle>
                        <CardDescription>Use tokens to RSVP for events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-5xl font-bold text-primary">{balance}</div>
                        <p className="text-sm text-muted-foreground mt-2">Available Tokens</p>
                        {/* Placeholder for purchase button - Phase 4 */}
                        <div className="mt-6 p-4 bg-muted/50 rounded text-sm text-center">
                            Purchase options coming soon.
                        </div>
                    </CardContent>
                </Card>

                {/* Transaction History */}
                <Card>
                    <CardHeader>
                        <CardTitle>Transaction History</CardTitle>
                        <CardDescription>Recent activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {transactions.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>
                            ) : (
                                transactions.map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className={tx.type === 'CREDIT' ? "text-green-500 bg-green-500/10 p-2 rounded-full" : "text-red-500 bg-red-500/10 p-2 rounded-full"}>
                                                {tx.type === 'CREDIT' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{tx.description || (tx.type === 'CREDIT' ? "Tokens Purchased" : "Tokens Spent")}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(tx.createdAt as unknown as string).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className={tx.type === 'CREDIT' ? "font-bold text-green-600" : "font-bold text-red-600"}>
                                            {tx.type === 'CREDIT' ? '+' : '-'}{tx.amount}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    );
}
