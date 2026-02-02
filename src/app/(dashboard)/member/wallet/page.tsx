"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { CreditCard, History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function WalletPage() {
    const { profile } = useAuth();

    return (
        <div className="container py-8 space-y-8 max-w-4xl">
            <h1 className="text-3xl font-bold">My Wallet</h1>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Balance Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Token Balance</CardTitle>
                        <CardDescription>Use tokens to book events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold mb-4">{profile?.tokenBalance || 0}</div>
                        <Button className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Buy Tokens
                        </Button>
                    </CardContent>
                </Card>

                {/* Payment Methods */}
                <Card>
                    <CardHeader>
                        <CardTitle>Payment Methods</CardTitle>
                        <CardDescription>Manage your saved cards</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Placeholder Card */}
                        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="font-medium">Visa ending in 4242</p>
                                    <p className="text-xs text-muted-foreground">Expires 12/28</p>
                                </div>
                            </div>
                            <Badge variant="secondary">Default</Badge>
                        </div>

                        <Button variant="outline" className="w-full">
                            Add New Card
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Transaction History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Transaction History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        <p>No recent transactions.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
