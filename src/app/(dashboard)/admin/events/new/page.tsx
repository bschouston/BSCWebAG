import { EventForm } from "@/components/admin/event-form";

export default function NewEventPage() {
    return (
        <div className="container p-8">
            <h1 className="text-3xl font-bold mb-8">Create New Event</h1>
            <EventForm />
        </div>
    );
}
