"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Role, UserProfile } from "@/types";
import { AdminMemberProfileForm } from "@/components/admin/admin-member-profile-form";
import { AccessChips } from "@/components/admin/access-chips";
import { RoleBadge } from "@/components/admin/role-badge";
import { isClubMemberRole, memberAccessLabels } from "@/lib/member-access";
import { isValidItsNumber, normalizeItsNumber } from "@/lib/its-number";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2 } from "lucide-react";

type RsvpRow = {
  id: string;
  source: "event_rsvps" | "event_registrations";
  eventId: string | null;
  eventTitle: string;
  status: string;
  waitlistPosition: number | null;
  createdAt: string | null;
};

type PendingTokenRequest = {
  id: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string | null;
};

type TokenRow = {
  id: string;
  type?: string;
  amount?: number;
  description?: string;
  createdAt?: string | null;
};

export default function AdminMemberRecordPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(params);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = [
    "overview",
    "profile",
    "events",
    "wallet",
    "shop",
    "account",
  ].includes(tabParam ?? "")
    ? tabParam!
    : "overview";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const { user: authUser, profile: adminProfile, loading: authLoading } = useAuth();
  const [member, setMember] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [rsvpBusy, setRsvpBusy] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TokenRow[]>([]);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [pendingTokenRequest, setPendingTokenRequest] = useState<PendingTokenRequest | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("MEMBER");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [itsInput, setItsInput] = useState("");
  const [itsBusy, setItsBusy] = useState(false);
  const [identityFirst, setIdentityFirst] = useState("");
  const [identityLast, setIdentityLast] = useState("");
  const [identityPhotoFile, setIdentityPhotoFile] = useState<File | null>(null);
  const [identityPhotoPreview, setIdentityPhotoPreview] = useState<string | null>(null);
  const [identityClearPhoto, setIdentityClearPhoto] = useState(false);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [testKeysConfigured, setTestKeysConfigured] = useState(false);
  const [stripeModeBusy, setStripeModeBusy] = useState(false);

  const isSuperAdmin = adminProfile?.role === "SUPER_ADMIN";

  const loadMember = async () => {
    const token = await authUser?.getIdToken();
    const res = await fetch(`/api/admin/users/${uid}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to fetch user");
    const data = await res.json();
    setMember(data);
    setSelectedRole(data.role || "MEMBER");
    setBalance(typeof data.tokenBalance === "number" ? data.tokenBalance : 0);
    setIdentityFirst(typeof data.firstName === "string" ? data.firstName : "");
    setIdentityLast(typeof data.lastName === "string" ? data.lastName : "");
    setIdentityPhotoFile(null);
    setIdentityPhotoPreview(null);
    setIdentityClearPhoto(false);
    return data;
  };

  useEffect(() => {
    if (authLoading || !authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loadMember();
        if (!isClubMemberRole(data.role)) return;
        const token = await authUser.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [rsvpRes, tokenRes, modeRes] = await Promise.all([
          fetch(`/api/admin/users/${uid}/rsvps`, { headers }),
          fetch(`/api/admin/users/${uid}/tokens`, { headers }),
          adminProfile?.role === "SUPER_ADMIN"
            ? fetch(`/api/super-admin/users/${uid}/wallet-stripe-mode`, { headers })
            : Promise.resolve(null),
        ]);
        if (!cancelled && rsvpRes.ok) {
          const data = await rsvpRes.json();
          setRsvps(data.items ?? []);
        }
        if (!cancelled && tokenRes.ok) {
          const data = await tokenRes.json();
          setBalance(data.balance ?? 0);
          setTransactions(data.transactions ?? []);
          setPendingTokenRequest(data.pendingTokenRequest ?? null);
        }
        if (!cancelled && modeRes && modeRes.ok) {
          const modeData = await modeRes.json();
          setTestKeysConfigured(Boolean(modeData.testKeysConfigured));
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, authUser, authLoading, adminProfile?.role]);

  const headers = async () => {
    const token = await authUser!.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const changeRsvp = async (row: RsvpRow, status: string) => {
    setRsvpBusy(row.id);
    try {
      const res = await fetch(`/api/admin/users/${uid}/rsvps`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({
          id: row.id,
          source: row.source,
          eventId: row.eventId,
          status,
        }),
      });
      if (!res.ok) throw new Error("Failed to update RSVP");
      setRsvps((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update RSVP");
    } finally {
      setRsvpBusy(null);
    }
  };

  const adjustTokens = async (direction: "credit" | "debit") => {
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount <= 0 || !adjustReason.trim()) {
      alert("Enter a positive whole number and a reason.");
      return;
    }
    if (direction === "debit" && amount > balance) {
      if (
        !confirm(
          `Remove ${amount} tokens? Current balance is ${balance}. This cannot make the balance negative.`
        )
      ) {
        return;
      }
    }
    setAdjusting(true);
    try {
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "").slice(0, 32)
          : `adj${Date.now()}`;
      const res = await fetch(`/api/admin/users/${uid}/tokens`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          amount,
          direction,
          reason: adjustReason.trim(),
          clientRequestId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to adjust tokens");
      setBalance(data.balance);
      setAdjustAmount("");
      setAdjustReason("");
      const token = await authUser!.getIdToken();
      const tokenRes = await fetch(`/api/admin/users/${uid}/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tokenRes.ok) {
        const next = await tokenRes.json();
        setTransactions(next.transactions ?? []);
        setPendingTokenRequest(next.pendingTokenRequest ?? null);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to adjust tokens");
    } finally {
      setAdjusting(false);
    }
  };

  const requestMemberTokens = async () => {
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount <= 0 || !adjustReason.trim()) {
      alert("Enter a positive whole number and a reason.");
      return;
    }
    if (pendingTokenRequest) {
      alert("This member already has an unpaid token request. Cancel it first or wait for payment.");
      return;
    }
    setRequestBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${uid}/token-requests`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ amount, reason: adjustReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create token request");
      setPendingTokenRequest(data.pendingTokenRequest ?? null);
      setAdjustAmount("");
      setAdjustReason("");
      alert("Token request sent. The member’s wallet is frozen until they pay.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create token request");
    } finally {
      setRequestBusy(false);
    }
  };

  const cancelTokenRequest = async () => {
    if (!pendingTokenRequest) return;
    if (!confirm("Cancel this unpaid token request? The member’s wallet will unfreeze.")) return;
    setRequestBusy(true);
    try {
      const res = await fetch(
        `/api/admin/users/${uid}/token-requests/${pendingTokenRequest.id}/cancel`,
        { method: "POST", headers: await headers(), body: "{}" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      setPendingTokenRequest(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setRequestBusy(false);
    }
  };

  const setWalletStripeMode = async (mode: "live" | "test") => {
    setStripeModeBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/super-admin/users/${uid}/wallet-stripe-mode`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update Stripe mode");
      setTestKeysConfigured(Boolean(data.testKeysConfigured));
      await loadMember();
      setAccountMsg(
        mode === "test"
          ? "Token wallet is on Stripe sandbox (test cards). Featured registrations still use live Stripe."
          : "Token wallet is back on live Stripe."
      );
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to update Stripe mode");
    } finally {
      setStripeModeBusy(false);
    }
  };

  const setBillingFreeze = async (freeze: boolean) => {
    const note = freeze
      ? prompt("Optional note for manual freeze:") ?? ""
      : prompt("Optional note for unfreeze:") ?? "";
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/super-admin/users/${uid}/billing-freeze`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ freeze, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update billing freeze");
      await loadMember();
      setAccountMsg(freeze ? "Wallet frozen." : "Wallet unfrozen.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to update billing freeze");
    } finally {
      setAccountBusy(false);
    }
  };

  const saveRole = async () => {
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({ role: selectedRole }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update role");
      }
      await loadMember();
      setAccountMsg("Role saved.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setAccountBusy(false);
    }
  };

  const toggleActive = async (isActive: boolean) => {
    if (!isActive) {
      if (
        !confirm(
          "Disable this account? They will not be able to sign in. The card on file will be removed from Stripe. Tokens stay; they must add a new card after you enable them again."
        )
      ) {
        return;
      }
    }
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/status`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      await loadMember();
      setAccountMsg(isActive ? "Account enabled." : "Account disabled.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setAccountBusy(false);
    }
  };

  const releaseIts = async () => {
    if (!confirm("Release this ITS#? The member will need to claim again.")) return;
    setItsBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/its`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ action: "release" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to release ITS#");
      setItsInput("");
      await loadMember();
      setAccountMsg("ITS# released.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to release ITS#");
    } finally {
      setItsBusy(false);
    }
  };

  const reassignIts = async () => {
    const next = normalizeItsNumber(itsInput);
    if (!isValidItsNumber(next)) {
      setAccountMsg("Enter a valid 8-digit ITS#.");
      return;
    }
    if (!confirm(`Reassign ITS# to ${next}?`)) return;
    setItsBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/its`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ action: "reassign", itsNumber: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reassign ITS#");
      setItsInput("");
      await loadMember();
      setAccountMsg(`ITS# set to ${data.itsNumber}.`);
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to reassign ITS#");
    } finally {
      setItsBusy(false);
    }
  };

  const saveIdentity = async () => {
    const first = identityFirst.trim();
    const last = identityLast.trim();
    if (!first && !last) {
      setAccountMsg("Enter at least a first or last name.");
      return;
    }
    if (
      !confirm(
        "Override Google name/photo for this member?\n\nThis is audited. Their next Google login will NOT refresh name or photo from Google while this override is set."
      )
    ) {
      return;
    }
    setIdentityBusy(true);
    setAccountMsg(null);
    try {
      const token = await authUser?.getIdToken();
      const form = new FormData();
      form.set("firstName", first);
      form.set("lastName", last);
      if (identityClearPhoto) form.set("clearPhoto", "true");
      if (identityPhotoFile) form.set("photo", identityPhotoFile);
      const res = await fetch(`/api/admin/users/${uid}/identity`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update identity");
      await loadMember();
      setAccountMsg("Name/photo updated. Override is locked against Google login sync.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to update identity");
    } finally {
      setIdentityBusy(false);
    }
  };

  const resetIdentityToGoogle = async () => {
    if (
      !confirm(
        "Reset name and photo to this member’s Google account?\n\nThis clears the club override. Future Google logins will sync name/photo from Google again. This is audited."
      )
    ) {
      return;
    }
    setIdentityBusy(true);
    setAccountMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/identity`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reset identity");
      await loadMember();
      setAccountMsg("Identity reset to Google. Override cleared.");
    } catch (e) {
      setAccountMsg(e instanceof Error ? e.message : "Failed to reset identity");
    } finally {
      setIdentityBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading member...
      </div>
    );
  }
  if (!member || !authUser) return <div className="p-8">Member not found</div>;

  if (!isClubMemberRole(member.role)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/members">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Members
          </Link>
        </Button>
        <p className="text-sm">
          This account is not a club member. Manage it under{" "}
          <Link href="/admin/fantasy" className="text-primary hover:underline">
            Fantasy Logins
          </Link>{" "}
          or{" "}
          <Link href="/admin/trackers" className="text-primary hover:underline">
            Tracker Logins
          </Link>
          .
        </p>
      </div>
    );
  }

  const access = memberAccessLabels(member);

  const initials =
    `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase() ||
    (member.email?.[0] ?? "?").toUpperCase();
  const targetIsSuper = member.role === "SUPER_ADMIN";
  const canEditAccount = isSuperAdmin || !targetIsSuper;
  const canToggleActive = isSuperAdmin && !targetIsSuper;

  return (
    <div className="min-w-0 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/members">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Members
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0 sm:h-14 sm:w-14">
            <AvatarImage src={member.photoURL ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold sm:text-2xl">
              {member.firstName} {member.lastName}
            </h1>
            <p className="break-all text-sm text-muted-foreground">{member.email}</p>
            <p className="font-mono text-sm text-muted-foreground">
              ITS# {member.itsNumber || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <RoleBadge role={member.role} />
          <Badge variant={member.isActive === false ? "destructive" : "outline"}>
            {member.isActive === false ? "Disabled" : "Active"}
          </Badge>
          <AccessChips labels={access} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="shop">Shop</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ITS#</CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-2xl font-bold">
                {member.itsNumber || "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tokens</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{balance}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Registrations</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{rsvps.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Access</CardTitle>
              </CardHeader>
              <CardContent>
                <AccessChips labels={access} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profile" className="pt-4">
          <AdminMemberProfileForm uid={uid} authUser={authUser} />
        </TabsContent>

        <TabsContent value="events" className="pt-4">
          {rsvps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No RSVPs or event registrations.</p>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {rsvps.map((row) => (
                <div key={`${row.source}-${row.id}`} className="space-y-2 rounded-lg border p-3">
                  <div className="font-medium break-words">{row.eventTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                  </div>
                  <Select
                    value={row.status}
                    disabled={rsvpBusy === row.id}
                    onValueChange={(v) => void changeRsvp(row, v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                      <SelectItem value="WAITLISTED">WAITLISTED</SelectItem>
                      <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rsvps.map((row) => (
                  <TableRow key={`${row.source}-${row.id}`}>
                    <TableCell>
                      <div className="font-medium">{row.eventTitle}</div>
                      <div className="text-xs text-muted-foreground">{row.source}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={row.status}
                        disabled={rsvpBusy === row.id}
                        onValueChange={(v) => void changeRsvp(row, v)}
                      >
                        <SelectTrigger className="w-36 ml-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                          <SelectItem value="WAITLISTED">WAITLISTED</SelectItem>
                          <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="wallet" className="pt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Balance</CardTitle>
              <CardDescription>
                {isSuperAdmin
                  ? "Add or remove tokens (ledger + audit), or request tokens the member must pay. Disputes freeze the wallet without auto clawback."
                  : "Token balance and ledger. Only Super Admin can adjust balances."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-3xl font-bold">{balance}</div>
                {member.billingFrozen ? (
                  <Badge variant="destructive">Billing frozen</Badge>
                ) : null}
                {pendingTokenRequest ? (
                  <Badge variant="destructive">Token request unpaid</Badge>
                ) : null}
              </div>
              {member.billingFrozen && member.billingFreezeMeta ? (
                <p className="text-xs text-muted-foreground">
                  Dispute:{" "}
                  {String(
                    (member.billingFreezeMeta as { disputeId?: string }).disputeId ||
                      member.billingFreezeDisputeId ||
                      "—"
                  )}
                  {(member.billingFreezeMeta as { status?: string }).status
                    ? ` · ${(member.billingFreezeMeta as { status?: string }).status}`
                    : ""}
                </p>
              ) : null}
              {isSuperAdmin ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {member.billingFrozen ? (
                      <Button
                        variant="outline"
                        disabled={accountBusy}
                        onClick={() => void setBillingFreeze(false)}
                      >
                        Unfreeze wallet
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={accountBusy}
                        onClick={() => void setBillingFreeze(true)}
                      >
                        Freeze wallet
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">Stripe sandbox (token wallet)</p>
                      {member.walletStripeMode === "test" ? (
                        <Badge variant="outline">Sandbox</Badge>
                      ) : (
                        <Badge variant="secondary">Live</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sandbox uses Stripe test keys and test cards (4242…). Featured tournament
                      registrations for this member still use live Stripe. Leave the Stripe
                      Dashboard in live view.
                    </p>
                    {!testKeysConfigured ? (
                      <p className="text-xs text-destructive">
                        Add STRIPE_SECRET_KEY_TEST and STRIPE_WEBHOOK_SECRET_TEST to enable sandbox.
                      </p>
                    ) : null}
                    {member.walletStripeMode === "test" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stripeModeBusy}
                        onClick={() => void setWalletStripeMode("live")}
                      >
                        {stripeModeBusy ? "Saving…" : "Turn sandbox off"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stripeModeBusy || !testKeysConfigured}
                        onClick={() => void setWalletStripeMode("test")}
                      >
                        {stripeModeBusy ? "Saving…" : "Enable sandbox"}
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border p-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Token updates</p>
                      <p className="text-xs text-muted-foreground">
                        Enter a positive token amount and a reason. Add credits the wallet, Remove
                        debits it, and Request Member creates a mandatory payment the member must
                        complete in My Wallet.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={adjustAmount}
                        onKeyDown={(e) => {
                          if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setAdjustAmount(digits);
                        }}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Reason</Label>
                      <Input
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                      />
                    </div>
                  </div>
                  {pendingTokenRequest ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                      <p className="font-medium">Unpaid request: {pendingTokenRequest.amount} tokens</p>
                      <p className="mt-1 text-muted-foreground">{pendingTokenRequest.reason}</p>
                      <Button
                        variant="outline"
                        className="mt-3 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                        disabled={requestBusy}
                        onClick={() => void cancelTokenRequest()}
                      >
                        {requestBusy ? "Cancelling…" : "Cancel request"}
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-9 border-[#1a3556] bg-background text-[#1a3556] hover:bg-[#1a3556] hover:text-white dark:border-[#ffd700] dark:bg-transparent dark:text-[#ffd700] dark:hover:bg-[#ffd700] dark:hover:text-[#122540] disabled:border-transparent disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                      onClick={() => void adjustTokens("credit")}
                      disabled={adjusting || requestBusy}
                    >
                      {adjusting ? "Saving…" : "Add"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 border-[#1a3556] bg-background text-[#1a3556] hover:bg-[#1a3556] hover:text-white dark:border-[#ffd700] dark:bg-transparent dark:text-[#ffd700] dark:hover:bg-[#ffd700] dark:hover:text-[#122540] disabled:border-transparent disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                      onClick={() => void adjustTokens("debit")}
                      disabled={adjusting || requestBusy}
                    >
                      {adjusting ? "Saving…" : "Remove"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 border-[#1a3556] bg-background text-[#1a3556] hover:bg-[#1a3556] hover:text-white dark:border-[#ffd700] dark:bg-transparent dark:text-[#ffd700] dark:hover:bg-[#ffd700] dark:hover:text-[#122540] disabled:border-transparent disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                      onClick={() => void requestMemberTokens()}
                      disabled={adjusting || requestBusy || Boolean(pendingTokenRequest)}
                    >
                      {requestBusy ? "Saving…" : "Request Member"}
                    </Button>
                  </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="whitespace-nowrap">
                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>{tx.type}</TableCell>
                  <TableCell>{tx.amount}</TableCell>
                  <TableCell>{tx.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </TabsContent>

        <TabsContent value="shop" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Shop</CardTitle>
              <CardDescription>Purchases will appear here when billing is live.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No purchases yet.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="pt-4">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Site role is Member, Admin, or Super Admin. Fantasy and Tracker access is managed in those login pages, not here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {accountMsg ? <p className="text-sm">{accountMsg}</p> : null}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={selectedRole}
                  onValueChange={(v) => setSelectedRole(v as Role)}
                  disabled={!canEditAccount || accountBusy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    {isSuperAdmin ? <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full sm:w-auto" onClick={() => void saveRole()} disabled={!canEditAccount || accountBusy}>
                Save role
              </Button>
              <div className="space-y-2 border-t pt-4">
                <Label>Access</Label>
                <AccessChips labels={access} />
                <p className="text-xs text-muted-foreground">
                  Not editable here.{" "}
                  <Link href="/admin/fantasy" className="text-primary hover:underline">
                    Fantasy Logins
                  </Link>
                  {" · "}
                  <Link href="/admin/trackers" className="text-primary hover:underline">
                    Tracker Logins
                  </Link>
                </p>
              </div>
              {isSuperAdmin ? (
                <div className="space-y-3 border-t pt-4">
                  <div>
                    <Label>Google identity (name &amp; photo)</Label>
                    <div
                      role="alert"
                      className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      These fields normally come from the member&apos;s Google account. Saving an override is
                      audited and stops Google login from refreshing name/photo for this member. Only use this
                      when Google is missing a name or photo (or the club must correct it).
                    </div>
                    {member.identityOverride ? (
                      <p className="mt-2 text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
                        Override is active — Google login will not update name/photo.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage
                        src={
                          identityClearPhoto
                            ? undefined
                            : identityPhotoPreview || member.photoURL || undefined
                        }
                      />
                      <AvatarFallback>
                        {`${identityFirst?.[0] ?? ""}${identityLast?.[0] ?? ""}`.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="identityPhoto">Replace photo</Label>
                      <Input
                        id="identityPhoto"
                        type="file"
                        accept="image/*"
                        disabled={identityBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setIdentityPhotoFile(file);
                          setIdentityClearPhoto(false);
                          if (identityPhotoPreview) URL.revokeObjectURL(identityPhotoPreview);
                          setIdentityPhotoPreview(file ? URL.createObjectURL(file) : null);
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={identityBusy || (!member.photoURL && !identityPhotoFile)}
                          onClick={() => {
                            setIdentityClearPhoto(true);
                            setIdentityPhotoFile(null);
                            if (identityPhotoPreview) URL.revokeObjectURL(identityPhotoPreview);
                            setIdentityPhotoPreview(null);
                          }}
                        >
                          Clear photo
                        </Button>
                        {identityClearPhoto ? (
                          <span className="self-center text-xs text-muted-foreground">
                            Photo will be cleared on save
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="identityFirst">First name</Label>
                      <Input
                        id="identityFirst"
                        value={identityFirst}
                        maxLength={60}
                        disabled={identityBusy}
                        onChange={(e) => setIdentityFirst(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="identityLast">Last name</Label>
                      <Input
                        id="identityLast"
                        value={identityLast}
                        maxLength={60}
                        disabled={identityBusy}
                        onChange={(e) => setIdentityLast(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={identityBusy}
                      onClick={() => void saveIdentity()}
                    >
                      {identityBusy ? "Saving…" : "Save identity"}
                    </Button>
                    {member.identityOverride ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={identityBusy}
                        onClick={() => void resetIdentityToGoogle()}
                      >
                        Reset to Google identity
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 border-t pt-4">
                  <Label>Google identity</Label>
                  <p className="text-sm">
                    {[member.firstName, member.lastName].filter(Boolean).join(" ") || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Only Super Admin can override Google name and photo.
                  </p>
                </div>
              )}
              {isSuperAdmin ? (
                <div className="space-y-3 border-t pt-4">
                  <div>
                    <Label>ITS#</Label>
                    <p className="mt-1 font-mono text-lg">{member.itsNumber || "Not set"}</p>
                    <p className="text-xs text-muted-foreground">
                      Super Admin can release or reassign. Changes are audited.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="itsReassign">New ITS#</Label>
                    <Input
                      id="itsReassign"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="12345678"
                      value={itsInput}
                      onChange={(e) =>
                        setItsInput(normalizeItsNumber(e.target.value).slice(0, 8))
                      }
                      disabled={itsBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={itsBusy || itsInput.length !== 8}
                      onClick={() => void reassignIts()}
                    >
                      {itsBusy ? "Saving…" : "Reassign ITS#"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={itsBusy || !member.itsNumber}
                      onClick={() => void releaseIts()}
                    >
                      Release ITS#
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 border-t pt-4">
                  <Label>ITS#</Label>
                  <p className="font-mono text-lg">{member.itsNumber || "Not set"}</p>
                </div>
              )}
              <div className="pt-4 border-t">
                {isSuperAdmin ? (
                  member.isActive === false ? (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={!canToggleActive || accountBusy}
                      onClick={() => void toggleActive(true)}
                    >
                      Enable account
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      className="w-full sm:w-auto"
                      disabled={!canToggleActive || accountBusy}
                      onClick={() => void toggleActive(false)}
                    >
                      Disable account
                    </Button>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Only Super Admin can disable or enable this account.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
