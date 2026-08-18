"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import {
    FlaskConical,
    RotateCcw,
    RefreshCw,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Wallet,
    Coins,
} from "lucide-react";
import { DateRangeInputs } from "@/components/admin/date-range-inputs";
import type { TokenTransactionRow } from "@/app/api/super-admin/token-transactions/route";

type FilterTab = "all" | "live" | "sandbox" | "refunded";
type DirectionFilter = "all" | "CREDIT" | "DEBIT";
type StripeFilter = "all" | "charged" | "none";
type SortKey = "newest" | "oldest" | "tokens" | "stripe";

const REASON_LABELS: Record<string, string> = {
    purchase: "Purchase",
    auto_replenish: "Auto replenish",
    unit_purchase: "Unit purchase (RSVP)",
    package_purchase: "Package purchase (RSVP)",
    rsvp_hold: "RSVP hold",
    rsvp_settle_refund: "RSVP settle",
    rsvp_cancel_refund: "RSVP cancel",
    transfer_in: "Transfer in",
    transfer_out: "Transfer out",
    admin_adjust: "Admin adjust",
    rsvp: "RSVP (legacy)",
};

function walletHref(uid: string) {
    return `/admin/members/${uid}?tab=wallet`;
}

function getStripePublishableMode(): "live" | "test" | "unknown" {
    const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    if (k.startsWith("pk_live_")) return "live";
    if (k.startsWith("pk_test_")) return "test";
    return "unknown";
}

function reasonLabel(reason: string | null) {
    if (!reason) return "—";
    return REASON_LABELS[reason] ?? reason;
}

export default function TokenTransactionsPage() {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<TokenTransactionRow[]>([]);
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
    const [reasonFilter, setReasonFilter] = useState("all");
    const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
    const [stripeFilter, setStripeFilter] = useState<StripeFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("newest");

    const [refundTarget, setRefundTarget] = useState<TokenTransactionRow | null>(null);
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
        const res = await fetch(`/api/super-admin/token-transactions?${params.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        const rows = (data.transactions ?? []) as TokenTransactionRow[];
        setTransactions((prev) => (replace ? rows : [...prev, ...rows]));
        setNextCursor(data.nextCursor ?? null);
    };

    const fetchTransactions = async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            await fetchPage(null, true);
        } catch (err) {
            console.error("Failed to fetch token transactions:", err);
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
            console.error("Failed to load more token transactions:", err);
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
            const res = await fetch("/api/super-admin/token-transactions/refund", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ transactionId: refundTarget.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Refund failed");

            setTransactions((prev) =>
                prev.map((t) =>
                    t.id === refundTarget.id
                        ? {
                              ...t,
                              stripeChargeStatus: "refunded",
                              stripeRefundId: data.refundId,
                              refundable: false,
                          }
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

    const chargedRows = transactions.filter((t) => t.stripePaymentIntentId);
    const liveRevenue = chargedRows
        .filter((t) => t.stripeLivemode && t.stripeChargeStatus !== "refunded")
        .reduce((s, t) => s + (t.stripeAmountPaid ?? 0), 0);
    const sandboxCount = chargedRows.filter((t) => t.stripeLivemode === false).length;
    const refundedCount = chargedRows.filter(
        (t) => t.stripeChargeStatus === "refunded" || !!t.stripeRefundId
    ).length;

    const reasonOptions = useMemo(() => {
        const set = new Set(transactions.map((t) => t.reason).filter(Boolean) as string[]);
        return ["all", ...[...set].sort()];
    }, [transactions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = transactions.filter((t) => {
            if (activeTab === "live" && t.stripeLivemode !== true) return false;
            if (activeTab === "sandbox" && t.stripeLivemode !== false) return false;
            if (
                activeTab === "refunded" &&
                t.stripeChargeStatus !== "refunded" &&
                !t.stripeRefundId
            ) {
                return false;
            }
            if (reasonFilter !== "all" && t.reason !== reasonFilter) return false;
            if (directionFilter !== "all" && t.type !== directionFilter) return false;
            if (stripeFilter === "charged" && !t.stripePaymentIntentId) return false;
            if (stripeFilter === "none" && t.stripePaymentIntentId) return false;
            if (q) {
                const name = `${t.firstName} ${t.lastName}`.toLowerCase();
                const hay = `${name} ${t.email} ${t.userId} ${t.id}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        rows.sort((a, b) => {
            if (sortKey === "oldest") {
                return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
            }
            if (sortKey === "tokens") return b.amount - a.amount;
            if (sortKey === "stripe") return (b.stripeAmountPaid ?? -1) - (a.stripeAmountPaid ?? -1);
            return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
        });
        return rows;
    }, [transactions, activeTab, reasonFilter, directionFilter, stripeFilter, search, sortKey]);

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

    const ModeBadge = ({ livemode }: { livemode: boolean | null }) => {
        if (livemode === null) return <span className="text-xs text-muted-foreground">—</span>;
        return livemode ? (
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
    };

    const StatusBadge = ({ tx }: { tx: TokenTransactionRow }) => {
        if (!tx.stripePaymentIntentId) {
            return <span className="text-xs text-muted-foreground">—</span>;
        }
        if (tx.stripeChargeStatus === "refunded" || tx.stripeRefundId) {
            return (
                <Badge variant="destructive" className="text-xs">
                    Refunded
                </Badge>
            );
        }
        if (tx.stripeChargeStatus === "paid" || tx.stripeChargeStatus === "succeeded") {
            return (
                <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                    Paid
                </span>
            );
        }
        return (
            <Badge variant="outline" className="text-xs capitalize">
                {tx.stripeChargeStatus ?? "charged"}
            </Badge>
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
            chargedRows.length > 0 &&
            chargedRows.every((t) => t.stripeLivemode === false));

    const isLiveStripeKeys = publishableMode === "live";

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {isLiveStripeKeys && !isTestMode && (
                <div className="flex items-center gap-3 rounded-lg border border-green-600/30 bg-green-50 px-4 py-3 text-green-900 dark:bg-green-900/20 dark:text-green-200 dark:border-green-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium">
                        LIVE MODE — token pack charges use your live Stripe account. Refunds return
                        card funds only; token balances are not changed automatically.
                    </span>
                </div>
            )}

            {isTestMode && (
                <div className="flex items-center gap-3 rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
                    <FlaskConical className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">
                        TEST MODE — Publishable key is <strong>pk_test_…</strong> (or legacy data
                        only). Sandbox payments are not real money.
                    </span>
                </div>
            )}

            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Token Transactions</h1>
                    <p className="text-muted-foreground mt-1">
                        Token ledger plus Stripe refunds for pack purchases. Token balances stay
                        unless you adjust them on the member wallet.
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
                            <Coins className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{fmtAmount(liveRevenue)}</p>
                            <p className="text-xs text-muted-foreground">Live token-pack charges (loaded)</p>
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
                            <p className="text-xs text-muted-foreground">Card refunds issued</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transactions</CardTitle>
                    <CardDescription>
                        {transactions.length} loaded · {fmtAmount(liveRevenue)} live pack charges
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
                                        chargedRows.filter((t) => t.stripeLivemode).length}
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
                            placeholder="Search name, email, or uid"
                            className="w-full sm:w-64"
                        />
                        <Select value={reasonFilter} onValueChange={setReasonFilter}>
                            <SelectTrigger className="w-[180px]" size="sm">
                                <SelectValue placeholder="Reason" />
                            </SelectTrigger>
                            <SelectContent>
                                {reasonOptions.map((reason) => (
                                    <SelectItem key={reason} value={reason}>
                                        {reason === "all" ? "All reasons" : reasonLabel(reason)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={directionFilter}
                            onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}
                        >
                            <SelectTrigger className="w-[150px]" size="sm">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Credit & debit</SelectItem>
                                <SelectItem value="CREDIT">Credit</SelectItem>
                                <SelectItem value="DEBIT">Debit</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={stripeFilter}
                            onValueChange={(v) => setStripeFilter(v as StripeFilter)}
                        >
                            <SelectTrigger className="w-[170px]" size="sm">
                                <SelectValue placeholder="Stripe" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stripe</SelectItem>
                                <SelectItem value="charged">Has Stripe charge</SelectItem>
                                <SelectItem value="none">No Stripe charge</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                            <SelectTrigger className="w-[160px]" size="sm">
                                <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">Newest first</SelectItem>
                                <SelectItem value="oldest">Oldest first</SelectItem>
                                <SelectItem value="tokens">Tokens high → low</SelectItem>
                                <SelectItem value="stripe">Stripe amount</SelectItem>
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
                                    <TableHead>Member</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Tokens</TableHead>
                                    <TableHead>Balance after</TableHead>
                                    <TableHead>Stripe amount</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={9}
                                            className="h-32 text-center text-muted-foreground"
                                        >
                                            No transactions match this filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((tx) => {
                                        const name =
                                            [tx.firstName, tx.lastName].filter(Boolean).join(" ") ||
                                            "Member";
                                        const signed =
                                            tx.type === "DEBIT" ? `−${tx.amount}` : `+${tx.amount}`;
                                        return (
                                            <TableRow key={tx.id}>
                                                <TableCell className="whitespace-nowrap text-sm">
                                                    {fmtDate(tx.createdAt)}
                                                </TableCell>
                                                <TableCell>
                                                    <Link
                                                        href={walletHref(tx.userId)}
                                                        className="font-medium text-sm text-primary hover:underline"
                                                    >
                                                        {name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {tx.email || tx.userId}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    <p>{reasonLabel(tx.reason)}</p>
                                                    {tx.description && (
                                                        <p className="text-xs text-muted-foreground max-w-[220px] truncate">
                                                            {tx.description}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell
                                                    className={`font-semibold text-sm ${
                                                        tx.type === "DEBIT"
                                                            ? "text-destructive"
                                                            : "text-green-700 dark:text-green-400"
                                                    }`}
                                                >
                                                    {signed}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {tx.balanceAfter ?? "—"}
                                                </TableCell>
                                                <TableCell className="font-semibold text-sm">
                                                    {tx.stripeAmountPaid != null
                                                        ? fmtAmount(tx.stripeAmountPaid)
                                                        : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <ModeBadge livemode={tx.stripeLivemode} />
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge tx={tx} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="outline" size="sm" className="h-7 px-3 text-xs" asChild>
                                                            <Link href={walletHref(tx.userId)}>
                                                                <Wallet className="h-3 w-3 mr-1" />
                                                                Wallet
                                                            </Link>
                                                        </Button>
                                                        {tx.refundable ? (
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
                                                        ) : tx.stripeChargeStatus === "refunded" ||
                                                          tx.stripeRefundId ? (
                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                                Refunded
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
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
                            Confirm card refund
                        </DialogTitle>
                        <DialogDescription>
                            This refunds the Stripe charge only. Tokens stay on the member wallet
                            unless you adjust them manually.
                        </DialogDescription>
                    </DialogHeader>

                    {refundTarget && (
                        <div className="space-y-4 py-2">
                            {refundTarget.stripeLivemode === false && (
                                <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/20">
                                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                        This is a <strong>sandbox / test payment</strong>. Stripe
                                        will process a test refund but no real money will be
                                        returned.
                                    </p>
                                </div>
                            )}

                            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Member</span>
                                    <span className="font-medium">
                                        {[refundTarget.firstName, refundTarget.lastName]
                                            .filter(Boolean)
                                            .join(" ") || "Member"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Email</span>
                                    <span className="font-medium">{refundTarget.email || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Reason</span>
                                    <span className="font-medium">
                                        {reasonLabel(refundTarget.reason)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tokens credited</span>
                                    <span className="font-medium">+{refundTarget.amount}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 mt-2">
                                    <span className="text-muted-foreground">Refund amount</span>
                                    <span className="font-bold text-base">
                                        {fmtAmount(refundTarget.stripeAmountPaid ?? 0)}
                                    </span>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full" asChild>
                                <Link href={walletHref(refundTarget.userId)}>
                                    <Wallet className="h-4 w-4 mr-2" />
                                    Open member wallet
                                </Link>
                            </Button>

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
                                    <RotateCcw className="mr-2 h-4 w-4" /> Issue refund
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
