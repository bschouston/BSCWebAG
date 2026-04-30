import { getAdminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { NewsArticle } from "@/types";
import { Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const adminDb = getAdminDb();
    const { id } = await params;
    try {
        const doc = await adminDb.collection("news").doc(id).get();
        if (!doc.exists) return {};
        const data = doc.data() as NewsArticle & Record<string, any>;
        const title = `${data.title} — Burhani Sports Club`;
        const description = (data.summary ?? data.content ?? "").slice(0, 160);
        const image = data.coverImage ?? undefined;
        return {
            title,
            description,
            openGraph: {
                title,
                description,
                url: `${SITE_URL}/news/${id}`,
                images: image ? [{ url: image }] : [],
                type: "article",
            },
            twitter: {
                card: "summary_large_image",
                title,
                description,
                images: image ? [image] : [],
            },
        };
    } catch {
        return {};
    }
}

export default async function NewsArticlePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const adminDb = getAdminDb();
    const { id } = await params;

    const doc = await adminDb.collection("news").doc(id).get();

    if (!doc.exists) {
        notFound();
    }

    const article = doc.data() as NewsArticle & Record<string, any>;

    const publishedDate = (() => {
        if (!article.publishedAt) return "Draft";
        if (typeof article.publishedAt === "object" && "toDate" in article.publishedAt) {
            return (article.publishedAt as any).toDate().toLocaleDateString();
        }
        return new Date(article.publishedAt as string | number).toLocaleDateString();
    })();

    return (
        <article className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-6">
                <Link
                    href="/news"
                    className="text-muted-foreground hover:text-foreground flex items-center text-sm mb-4"
                >
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back to News
                </Link>
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                    {article.title}
                </h1>
                <div className="flex items-center text-muted-foreground mb-6">
                    <Calendar className="mr-2 h-4 w-4" />
                    {publishedDate}
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
                <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed">
                    {article.content}
                </div>
            </div>

            <div className="mt-10">
                <Button variant="outline" asChild>
                    <Link href="/news">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to News
                    </Link>
                </Button>
            </div>
        </article>
    );
}
