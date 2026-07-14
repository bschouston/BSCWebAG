import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ eventId?: string; edit?: string }>;
}

/** Legacy URL — prefer /register/f/volleyball?eventId=… */
export default async function VolleyballRegistrationPage({ searchParams }: Props) {
  const { eventId, edit } = await searchParams;
  const qs = new URLSearchParams();
  if (eventId) qs.set("eventId", eventId);
  if (edit) qs.set("edit", edit);
  const q = qs.toString();
  redirect(`/register/f/volleyball${q ? `?${q}` : ""}`);
}
