"use client";

import { useEffect, useState } from "react";
import { NewsArticle } from "@/types";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewsArticlePage() {
    const params = useParams();
    const id = params.id as string;
    const [article, setArticle] = useState<NewsArticle | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchArticle() {
            if (!id) return;
            try {
                const res = await fetch(`/api/news/${id}`);
                if (!res.ok) throw new Error("Article not found");
                const data = await res.json();
                setArticle(data);
            } catch (error) {
                console.error("Failed to fetch article", error);
            } finally {
                setLoading(false);
            }
        }
        fetchArticle();
    }, [id]);

    if (loading) return <div className="container py-16 text-center">Loading article...</div>;
    if (!article) return <div className="container py-16 text-center">Article not found</div>;

    return (
        <div className="container py-16 max-w-4xl">
            <Link href="/news" className="inline-block mb-8">
                <Button variant="ghost">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to News
                </Button>
            </Link>

            <article className="prose dark:prose-invert lg:prose-xl mx-auto">
                <h1 className="text-4xl font-bold mb-4">{article.title}</h1>

                <div className="flex items-center text-muted-foreground mb-8 text-sm">
                    <Calendar className="mr-2 h-4 w-4" />
                    {new Date(article.publishedAt as unknown as string).toLocaleDateString()}
                    <span className="mx-2">•</span>
                    <span>By Admin</span>
                </div>

                {/* Optional Cover Image */}
                <div className="h-64 md:h-96 bg-muted mb-8 rounded-lg flex items-center justify-center text-muted-foreground">
                    Cover Image Placeholder
                </div>

                <div className="whitespace-pre-wrap leading-relaxed">
                    {article.content}
                </div>
            </article>
        </div>
    );
}
