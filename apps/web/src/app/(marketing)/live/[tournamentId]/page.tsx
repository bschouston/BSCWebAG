import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy /live/[tournamentId] — redirect to the public tournament page. */
export default async function LiveTournamentRedirect({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  redirect(`/tournament/${tournamentId}`);
}
