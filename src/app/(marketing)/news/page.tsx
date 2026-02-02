"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewsArticle } from "@/types";
import Link from "next/link";
import { Calendar } from "lucide-react";

export default function NewsPage() {
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchNews() {
            try {
                const res = await fetch("/api/news");
                const data = await res.json();
                setArticles(data.articles || []);
            } catch (error) {
                console.error("Failed to fetch news", error);
            } finally {
                setLoading(false);
            }
        }
        fetchNews();
    }, []);

    return (
        <div className="container mx-auto px-4 py-16">
            <div className="text-center mb-16">
                <h1 className="text-4xl font-bold mb-4">Latest News</h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Stay updated with the latest announcements, match results, and club activities.
                </p>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading news...</div>
            ) : (
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {articles.map((article) => (
                        <Card key={article.id} className="flex flex-col h-full hover:shadow-lg transition-shadow">
                            {/* Optional Cover Image Placeholder */}
                            <div className="h-48 bg-muted w-full object-cover rounded-t-lg flex items-center justify-center text-muted-foreground">
                                Article Image
                            </div>
                            <CardHeader>
                                <div className="flex items-center text-sm text-muted-foreground mb-2">
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {new Date(article.publishedAt as unknown as string).toLocaleDateString()}
                                </div>
                                <CardTitle className="line-clamp-2">{article.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <CardDescription className="line-clamp-3">
                                    {article.excerpt}
                                </CardDescription>
                            </CardContent>
                            <CardFooter>
                                <Link href={`/news/${article.id}`} className="w-full">
                                    <Button variant="outline" className="w-full">Read More</Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    ))}

                    {articles.length === 0 && (
                        <div className="col-span-full text-center py-12 text-muted-foreground">
                            No news articles found.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
