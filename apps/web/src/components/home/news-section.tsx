"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NewsArticle } from "@/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

export function NewsSection() {
    const [news, setNews] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNews = async () => {
            try {
                // Fetch limit 3 for homepage
                const res = await fetch("/api/news?limit=3");
                if (res.ok) {
                    const data = await res.json();
                    // Filter client-side for PUBLISHED only, though API returns everything ordered by date
                    // ideally API should have a query param for status, but filtering here is fine for small scale
                    const publishedNews = data.filter((item: NewsArticle) => item.status === "PUBLISHED");
                    setNews(publishedNews.slice(0, 3));
                }
            } catch (error) {
                console.error("Failed to fetch news", error);
            } finally {
                setLoading(false);
            }
        };

        fetchNews();
    }, []);

    if (loading) {
        return (
            <section className="py-16">
                <div className="container mx-auto px-4">
                    <div className="flex justify-between items-center mb-8">
                        <div className="h-8 w-48 bg-muted animate-pulse rounded"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-[400px] rounded-xl bg-muted animate-pulse"></div>
                        ))}
                    </div>
                </div>
            </section>
        );
    }

    if (news.length === 0) {
        return null; // Don't show section if no news
    }

    return (
        <section className="py-16 bg-background">
            <div className="container mx-auto px-4">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold tracking-tight">Latest News</h2>
                    <Link href="/news" className="text-primary hover:underline font-medium">
                        Read More &rarr;
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {news.map((article) => (
                        <Card key={article.id} className="flex flex-col overflow-hidden h-full">
                            {article.coverImage && (
                                <div className="h-48 w-full overflow-hidden relative">
                                    <img
                                        src={article.coverImage}
                                        alt={article.title}
                                        className="object-cover w-full h-full transition-transform hover:scale-105 duration-300"
                                    />
                                </div>
                            )}
                            <CardHeader>
                                <div className="flex items-center text-xs text-muted-foreground mb-2">
                                    <Calendar className="mr-1 h-3 w-3" />
                                    {(() => {
                                        if (!article.publishedAt) return "";
                                        if (typeof article.publishedAt === 'object' && 'toDate' in article.publishedAt) {
                                            return article.publishedAt.toDate().toLocaleDateString();
                                        }
                                        return new Date(article.publishedAt as string | number).toLocaleDateString();
                                    })()}
                                </div>
                                <CardTitle className="line-clamp-2 hover:text-primary transition-colors">
                                    <Link href={`/news/${article.id}`}>
                                        {article.title}
                                    </Link>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <p className="text-muted-foreground text-sm line-clamp-3">
                                    {article.excerpt}
                                </p>
                            </CardContent>
                            <CardFooter>
                                <Link href={`/news/${article.id}`} className="w-full">
                                    <Button variant="outline" className="w-full">Read Article</Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
