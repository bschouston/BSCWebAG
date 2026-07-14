"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { key: "players", label: "Players" },
  { key: "teams", label: "Teams" },
  { key: "schedule", label: "Schedule" },
  { key: "stats", label: "Stats" },
  { key: "tracker-activity", label: "Tracker Activity" },
  { key: "registrations", label: "Registrations" },
] as const;

export function TournamentHubTabs({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();
  const active =
    tabs.find((t) => pathname.includes(`/admin/tournaments/${tournamentId}/${t.key}`))?.key ??
    "players";

  return (
    <Tabs value={active}>
      <TabsList className="flex h-auto flex-wrap gap-1">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} asChild>
            <Link href={`/admin/tournaments/${tournamentId}/${t.key}`}>{t.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
