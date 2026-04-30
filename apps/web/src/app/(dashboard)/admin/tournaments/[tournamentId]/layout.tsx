import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { key: "players", label: "Players" },
  { key: "teams", label: "Teams" },
  { key: "schedule", label: "Schedule" },
  { key: "stats", label: "Stats" },
] as const;

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <Tabs defaultValue="players">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} asChild>
                <Link href={`/admin/tournaments/${tournamentId}/${t.key}`}>{t.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {children}
    </div>
  );
}

