"use client";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, User, Wallet } from "lucide-react";
import { memberFullName } from "@/lib/member-name";
import { MemberPageHeader } from "@/components/dashboard/member-page-header";
import { CalendarSyncCard } from "@/components/calendar-sync-card";

export default function MemberDashboard() {
  const { user, profile, loading } = useAuth();
  const [balance, setBalance] = useState(0);

  const name = memberFullName({
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    displayName: user?.displayName,
  });

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/member/tokens?limit=1", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.balance !== undefined) setBalance(data.balance);
      } catch (error) {
        console.error(error);
      }
    }
    fetchData();
  }, [user]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <MemberPageHeader
        title={`Welcome, ${name}`}
        subtitle="Jump into weekly events, manage tokens, or keep your player profile current."
      />

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/member/wallet" className="mz-tile mz-tile-gold">
          <div className="relative z-10">
            <Wallet className="mb-4 h-7 w-7 text-[color:var(--mz-gold)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mz-gold)]">
              My Wallet
            </p>
            <p className="mt-2 text-5xl font-extrabold tabular-nums">{balance}</p>
            <p className="mt-1 text-sm text-white/75">Tokens ready for weekly RSVPs</p>
          </div>
          <span className="relative z-10 mt-6 text-sm font-semibold text-[color:var(--mz-gold)]">
            Open wallet →
          </span>
        </Link>

        <Link href="/member/events" className="mz-tile mz-tile-teal">
          <div>
            <Calendar className="mb-4 h-7 w-7" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              My Events
            </p>
            <p className="mt-3 text-2xl font-extrabold leading-tight">This week’s games</p>
            <p className="mt-1 text-sm text-white/80">RSVP and hold tokens at signup</p>
          </div>
          <span className="mt-6 text-sm font-semibold">Browse events →</span>
        </Link>

        <Link href="/member/profile" className="mz-tile mz-tile-coral md:col-span-2 lg:col-span-1">
          <div>
            <User className="mb-4 h-7 w-7" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              My Profile
            </p>
            <p className="mt-3 text-2xl font-extrabold leading-tight">Keep details sharp</p>
            <p className="mt-1 text-sm text-white/80">ITS#, contact, and player info</p>
          </div>
          <span className="mt-6 text-sm font-semibold">Edit profile →</span>
        </Link>
      </div>

      <div className="mt-8">
        <CalendarSyncCard />
      </div>
    </div>
  );
}
