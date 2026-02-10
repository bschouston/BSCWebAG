import { NewsForm } from "@/components/admin/news-form";

export default function NewNewsPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Create News Article</h1>
            <NewsForm />
        </div>
    );
}
