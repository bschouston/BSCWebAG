import { EventForm } from "@/components/admin/event-form";

export default async function EditWeeklySeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const id = seriesId?.trim() || "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#1a3556] dark:text-white">
          Edit weekly series
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the series template. Changes apply to future weeks that have not opened RSVP.
        </p>
      </div>
      {id ? <EventForm seriesEditId={id} /> : <p className="text-sm text-destructive">Missing series id.</p>}
    </div>
  );
}
