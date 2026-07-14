import { TournamentHubHeader } from "@/components/admin/tournament-hub-header";
import { TournamentHubTabs } from "@/components/admin/tournament-hub-tabs";

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
      <TournamentHubHeader tournamentId={tournamentId} />
      <TournamentHubTabs tournamentId={tournamentId} />
      {children}
    </div>
  );
}
