"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NewsArticle } from "@/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

export default function NewsPage() {
    const [news, setNews] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNews = async () => {
            try {
                const res = await fetch("/api/news");
                if (res.ok) {
                    const data = await res.json();
                    const publishedNews = data.filter((item: NewsArticle) => item.status === "PUBLISHED");
                    setNews(publishedNews);
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
            <div className="container mx-auto px-4 py-8">
                <h1 className="text-4xl font-bold mb-8">News & Updates</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-[400px] rounded-xl bg-muted animate-pulse"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8">News & Updates</h1>

            {news.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    No news articles found.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {news.map((article) => (
                        <Card key={article.id} className="flex flex-col overflow-hidden h-full hover:shadow-lg transition-shadow">
                            {article.coverImage && (
                                <div className="h-48 w-full overflow-hidden">
                                    <img
                                        src={article.coverImage}
                                        alt={article.title}
                                        className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
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
                                <CardTitle className="line-clamp-2">
                                    <Link href={`/news/${article.id}`} className="hover:text-primary transition-colors">
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
            )}
        </div>
    );
}
