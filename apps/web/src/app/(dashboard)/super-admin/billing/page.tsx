"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DateRangeInputs } from "@/components/admin/date-range-inputs";
import {
    FlaskConical,
    RotateCcw,
    RefreshCw,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    TrendingUp,
} from "lucide-react";
import type { BillingTransaction } from "@/app/api/super-admin/billing/route";

type FilterTab = "all" | "live" | "sandbox" | "refunded";
type StatusFilter = "all" | "paid" | "refunded";
type SortKey = "newest" | "oldest" | "amountHigh" | "amountLow";

function getStripePublishableMode(): "live" | "test" | "unknown" {
    const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    if (k.startsWith("pk_live_")) return "live";
    if (k.startsWith("pk_test_")) return "test";
    return "unknown";
}

export default function BillingManagementPage() {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const publishableMode = getStripePublishableMode();
    const [activeTab, setActiveTab] = useState<FilterTab>(() =>
        publishableMode === "live" ? "live" : "all"
    );
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [eventFilter, setEventFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("newest");

    const [refundTarget, setRefundTarget] = useState<BillingTransaction | null>(null);
    const [refunding, setRefunding] = useState(false);
    const [refundError, setRefundError] = useState<string | null>(null);

    const fetchPage = async (
        cursor: string | null,
        replace: boolean,
        from = dateFrom,
        to = dateTo
    ) => {
        const token = await user?.getIdToken();
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/super-admin/billing?${params.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        const rows = (data.transactions ?? []) as BillingTransaction[];
        setTransactions((prev) => (replace ? rows : [...prev, ...rows]));
        setNextCursor(data.nextCursor ?? null);
    };

    const fetchTransactions = async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            await fetchPage(null, true);
        } catch (err) {
            console.error("Failed to fetch billing data:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const didLoad = useRef(false);
    useEffect(() => {
        if (!user) return;
        void fetchTransactions(didLoad.current);
        didLoad.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, dateFrom, dateTo]);

    const handleLoadMore = async () => {
        if (!nextCursor) return;
        setLoadingMore(true);
        try {
            await fetchPage(nextCursor, false);
        } catch (err) {
            console.error("Failed to load more billing data:", err);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleRefund = async () => {
        if (!refundTarget) return;
        setRefunding(true);
        setRefundError(null);
        try {
            const token = await user?.getIdToken();
            const res = await fetch("/api/super-admin/billing/refund", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    eventId: refundTarget.eventId,
                    registrationId: refundTarget.registrationId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Refund failed");

            setTransactions((prev) =>
                prev.map((t) =>
                    t.registrationId === refundTarget.registrationId
                        ? { ...t, paymentStatus: "refunded", stripeRefundId: data.refundId }
                        : t
                )
            );
            setRefundTarget(null);
        } catch (err: unknown) {
            setRefundError(err instanceof Error ? err.message : "Refund failed");
        } finally {
            setRefunding(false);
        }
    };

    const liveRevenue = transactions
        .filter((t) => t.livemode && t.paymentStatus !== "refunded")
        .reduce((s, t) => s + t.amountPaid, 0);

    const sandboxCount = transactions.filter((t) => !t.livemode).length;
    const refundedCount = transactions.filter((t) => t.paymentStatus === "refunded").length;

    const eventOptions = useMemo(() => {
        const titles = [...new Set(transactions.map((t) => t.eventTitle).filter(Boolean))].sort();
        return titles;
    }, [transactions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = transactions.filter((t) => {
            if (activeTab === "live" && !t.livemode) return false;
            if (activeTab === "sandbox" && t.livemode) return false;
            if (activeTab === "refunded" && t.paymentStatus !== "refunded") return false;
            if (eventFilter !== "all" && t.eventTitle !== eventFilter) return false;
            if (statusFilter === "paid" && t.paymentStatus === "refunded") return false;
            if (statusFilter === "refunded" && t.paymentStatus !== "refunded") return false;
            if (q) {
                const name = `${t.firstName} ${t.lastName}`.toLowerCase();
                const hay = `${name} ${t.email} ${t.eventTitle} ${t.registrationId}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        rows.sort((a, b) => {
            if (sortKey === "oldest") {
                return (a.registeredAt ?? "").localeCompare(b.registeredAt ?? "");
            }
            if (sortKey === "amountHigh") return b.amountPaid - a.amountPaid;
            if (sortKey === "amountLow") return a.amountPaid - b.amountPaid;
            return (b.registeredAt ?? "").localeCompare(a.registeredAt ?? "");
        });
        return rows;
    }, [transactions, activeTab, eventFilter, statusFilter, search, sortKey]);

    const fmtDate = (iso: string | null) => {
        if (!iso) return "N/A";
        return new Date(iso).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const fmtAmount = (amount: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

    const ModeBadge = ({ livemode }: { livemode: boolean }) =>
        livemode ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                Live
            </span>
        ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400">
                <FlaskConical className="h-3 w-3" />
                Sandbox
            </span>
        );

    const StatusBadge = ({ status }: { status: string }) => {
        if (status === "refunded") {
            return (
                <Badge variant="destructive" className="text-xs">
                    Refunded
                </Badge>
            );
        }
        return (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                Paid
            </span>
        );
    };

    const tabs: { key: FilterTab; label: string }[] = [
        { key: "all", label: "All" },
        { key: "live", label: "Live Only" },
        { key: "sandbox", label: "Sandbox" },
        { key: "refunded", label: "Refunded" },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const isTestMode =
        publishableMode === "test" ||
        (publishableMode !== "live" &&
            transactions.length > 0 &&
            transactions.every((t) => !t.livemode));

    const isLiveStripeKeys = publishableMode === "live";

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {isLiveStripeKeys && !isTestMode && (
                <div className="flex items-center gap-3 rounded-lg border border-green-600/30 bg-green-50 px-4 py-3 text-green-900 dark:bg-green-900/20 dark:text-green-200 dark:border-green-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium">
                        LIVE MODE — <code className="text-xs font-mono bg-green-100/80 dark:bg-green-900/40 px-1 rounded">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> is{" "}
                        <strong>pk_live_…</strong>. New charges use your live Stripe account. Sandbox rows still appear as “Sandbox” if they were created with test keys.
                    </span>
                </div>
            )}

            {isTestMode && (
                <div className="flex items-center gap-3 rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
                    <FlaskConical className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">
                        TEST MODE — Publishable key is <strong>pk_test_…</strong> (or legacy data only). Sandbox payments are not real money.
                    </span>
                </div>
            )}

            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dollar Transactions</h1>
                    <p className="text-muted-foreground mt-1">
                        All Stripe transactions connected to event registrations.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTransactions(true)}
                    disabled={refreshing}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                            <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{fmtAmount(liveRevenue)}</p>
                            <p className="text-xs text-muted-foreground">Live Revenue (loaded)</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-full">
                            <FlaskConical className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{sandboxCount}</p>
                            <p className="text-xs text-muted-foreground">Sandbox / Test Payments</p>
                            <p className="text-xs text-muted-foreground italic">Not counted in revenue</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full">
                            <RotateCcw className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{refundedCount}</p>
                            <p className="text-xs text-muted-foreground">Refunds Issued</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                    <CardDescription>
                        {transactions.length} loaded · {fmtAmount(liveRevenue)} live revenue
                    </CardDescription>
                    <div className="flex gap-1 pt-2 flex-wrap">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                    activeTab === tab.key
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                            >
                                {tab.label}
                                <span
                                    className={`ml-1.5 text-xs ${
                                        activeTab === tab.key ? "opacity-80" : "opacity-60"
                                    }`}
                                >
                                    {tab.key === "all" && transactions.length}
                                    {tab.key === "live" &&
                                        transactions.filter((t) => t.livemode).length}
                                    {tab.key === "sandbox" && sandboxCount}
                                    {tab.key === "refunded" && refundedCount}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-3">
                        <DateRangeInputs
                            from={dateFrom}
                            to={dateTo}
                            onFromChange={setDateFrom}
                            onToChange={setDateTo}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name, email, or event"
                            className="w-full sm:w-64"
                        />
                        <Select value={eventFilter} onValueChange={setEventFilter}>
                            <SelectTrigger className="w-[200px]" size="sm">
                                <SelectValue placeholder="Event" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All events</SelectItem>
                                {eventOptions.map((title) => (
                                    <SelectItem key={title} value={title}>
                                        {title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                        >
                            <SelectTrigger className="w-[150px]" size="sm">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Paid & refunded</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="refunded">Refunded</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                            <SelectTrigger className="w-[170px]" size="sm">
                                <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">Newest first</SelectItem>
                                <SelectItem value="oldest">Oldest first</SelectItem>
                                <SelectItem value="amountHigh">Amount high → low</SelectItem>
                                <SelectItem value="amountLow">Amount low → high</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Participant</TableHead>
                                    <TableHead>Event</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Stripe Session</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="h-32 text-center text-muted-foreground"
                                        >
                                            No transactions match this filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((tx) => (
                                        <TableRow key={`${tx.eventId}:${tx.registrationId}`}>
                                            <TableCell className="whitespace-nowrap text-sm">
                                                {fmtDate(tx.registeredAt)}
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium text-sm">
                                                    {tx.firstName} {tx.lastName}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{tx.email}</p>
                                            </TableCell>
                                            <TableCell className="max-w-[180px] truncate text-sm">
                                                {tx.eventTitle}
                                            </TableCell>
                                            <TableCell className="font-semibold text-sm">
                                                {fmtAmount(tx.amountPaid)}
                                            </TableCell>
                                            <TableCell>
                                                <ModeBadge livemode={tx.livemode} />
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={tx.paymentStatus} />
                                            </TableCell>
                                            <TableCell>
                                                <a
                                                    href={`https://dashboard.stripe.com/${tx.livemode ? "" : "test/"}payments/${tx.stripeSessionId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-mono text-xs text-primary hover:underline"
                                                    title="View in Stripe Dashboard"
                                                >
                                                    {tx.stripeSessionId.slice(0, 16)}…
                                                </a>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {tx.paymentStatus === "refunded" ? (
                                                    <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                        Refunded
                                                    </span>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-3 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                                        onClick={() => {
                                                            setRefundError(null);
                                                            setRefundTarget(tx);
                                                        }}
                                                    >
                                                        <RotateCcw className="h-3 w-3 mr-1" />
                                                        Refund
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {nextCursor && (
                        <div className="flex justify-center p-4 border-t">
                            <Button
                                variant="outline"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading…
                                    </>
                                ) : (
                                    "Load more"
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={!!refundTarget}
                onOpenChange={(open) => {
                    if (!open && !refunding) setRefundTarget(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="h-5 w-5 text-destructive" />
                            Confirm Refund
                        </DialogTitle>
                        <DialogDescription>
                            This will issue a refund via Stripe. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    {refundTarget && (
                        <div className="space-y-4 py-2">
                            {!refundTarget.livemode && (
                                <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/20">
                                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                        This is a <strong>sandbox / test payment</strong>. Stripe will process a test refund but no real money will be returned.
                                    </p>
                                </div>
                            )}

                            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Participant</span>
                                    <span className="font-medium">
                                        {refundTarget.firstName} {refundTarget.lastName}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Email</span>
                                    <span className="font-medium">{refundTarget.email}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Event</span>
                                    <span className="font-medium">{refundTarget.eventTitle}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 mt-2">
                                    <span className="text-muted-foreground">Refund Amount</span>
                                    <span className="font-bold text-base">
                                        {fmtAmount(refundTarget.amountPaid)}
                                    </span>
                                </div>
                            </div>

                            {refundError && (
                                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {refundError}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRefundTarget(null)}
                            disabled={refunding}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleRefund} disabled={refunding}>
                            {refunding ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                                </>
                            ) : (
                                <>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Issue Refund
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
