"use client";

import { useEffect, useState, use } from "react";
import { NewsArticle } from "@/types";
import { Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
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
        return <div className="container mx-auto px-4 py-8 animate-pulse space-y-4">
            <div className="h-8 w-1/3 bg-muted rounded"></div>
            <div className="h-64 w-full bg-muted rounded"></div>
            <div className="h-4 w-full bg-muted rounded"></div>
            <div className="h-4 w-full bg-muted rounded"></div>
        </div>;
    }

    if (!article) {
        return (
            <div className="container mx-auto px-4 py-20 text-center">
                <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
                <Link href="/news">
                    <Button>Return to News</Button>
                </Link>
            </div>
        );
    }

    return (
        <article className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-6">
                <Link href="/news" className="text-muted-foreground hover:text-foreground flex items-center text-sm mb-4">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back to News
                </Link>
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{article.title}</h1>
                <div className="flex items-center text-muted-foreground mb-6">
                    <Calendar className="mr-2 h-4 w-4" />
                    {(() => {
                        if (!article.publishedAt) return "Draft";
                        if (typeof article.publishedAt === 'object' && 'toDate' in article.publishedAt) {
                            return article.publishedAt.toDate().toLocaleDateString();
                        }
                        return new Date(article.publishedAt as string | number).toLocaleDateString();
                    })()}
                </div>
            </div>

            {article.coverImage && (
                <div className="rounded-xl overflow-hidden mb-8 shadow-sm border">
                    <img
                        src={article.coverImage}
                        alt={article.title}
                        className="w-full h-auto max-h-[600px] object-cover"
                    />
                </div>
            )}

            <div className="prose prose-lg dark:prose-invert max-w-none">
                {/* 
                   If the content is Markdown, we would use react-markdown here.
                   For now, we render it essentially as text with whitespace preservation.
                   If HTML was stored, we would use dangerouslySetInnerHTML (carefully).
                */}
                <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed">
                    {article.content}
                </div>
            </div>
        </article>
    );
}
