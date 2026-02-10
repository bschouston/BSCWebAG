"use client";

import { NewsForm } from "@/components/admin/news-form";
import { useEffect, useState, use } from "react";
import { NewsArticle } from "@/types";

export default function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [article, setArticle] = useState<NewsArticle | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                const res = await fetch(`/api/news/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setArticle(data);
                }
            } catch (error) {
                console.error("Failed to fetch article", error);
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [id]);

    if (loading) {
        return <div>Loading article...</div>;
    }

    if (!article) {
        return <div>Article not found</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Edit News Article</h1>
            <NewsForm initialData={article} isid={id} />
        </div>
    );
}
