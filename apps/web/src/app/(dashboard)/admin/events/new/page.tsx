import { EventForm } from "@/components/admin/event-form";

type Props = {
    searchParams: Promise<{ fromSeries?: string }>;
};

export default async function NewEventPage({ searchParams }: Props) {
    const { fromSeries } = await searchParams;
    const fromSeriesId = fromSeries?.trim() || undefined;
    return (
        <div className="container p-8">
            <h1 className="mb-8 text-3xl font-bold text-foreground">
                {fromSeriesId ? "Duplicate weekly series" : "Create New Event"}
            </h1>
            <EventForm fromSeriesId={fromSeriesId} />
        </div>
    );
}
