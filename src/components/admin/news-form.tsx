"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewsArticle } from "@/types";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Schema Validation
const newsSchema = z.object({
    title: z.string().min(2, "Title must be at least 2 characters"),
    excerpt: z.string().min(10, "Excerpt must be at least 10 characters"),
    content: z.string().min(20, "Content must be at least 20 characters"),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    coverImage: z.string().optional(),
});

type NewsFormValues = z.infer<typeof newsSchema>;

interface NewsFormProps {
    initialData?: NewsArticle;
    isid?: string; // If editing
}

export function NewsForm({ initialData, isid }: NewsFormProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const form = useForm<NewsFormValues>({
        resolver: zodResolver(newsSchema) as any,
        defaultValues: {
            title: initialData?.title || "",
            excerpt: initialData?.excerpt || "",
            content: initialData?.content || "",
            status: initialData?.status || "DRAFT",
            coverImage: initialData?.coverImage || "",
        },
    });

    // Helper: Resize image and convert to Base64
    const resizeImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_WIDTH = 800; // Limit width to reduce size
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // Compress to JPEG with 0.7 quality to stay under 1MB limit
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                    resolve(dataUrl);
                };
                img.onerror = (error) => reject(error);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    async function onSubmit(data: NewsFormValues) {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const url = isid ? `/api/news/${isid}` : "/api/news";
            const method = isid ? "PUT" : "POST";

            let finalImageUrl = data.coverImage;

            if (imageFile) {
                setUploading(true);
                try {
                    finalImageUrl = await resizeImage(imageFile);
                } catch (err) {
                    console.error("Failed to process image", err);
                    alert("Failed to process image. Please try a smaller file.");
                    setUploading(false);
                    setLoading(false);
                    return;
                }
                setUploading(false);
            }

            const payload = {
                ...data,
                coverImage: finalImageUrl,
                authorId: user?.uid,
            };

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save news article");
            }

            router.push("/admin/news");
            router.refresh();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl bg-card p-6 rounded-lg border">

                <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input placeholder="News Headline..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="coverImage"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cover Image</FormLabel>
                            <FormControl>
                                <div className="flex flex-col gap-4">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setImageFile(e.target.files[0]);
                                            }
                                        }}
                                    />
                                    {(imageFile || field.value) && (
                                        <div className="relative aspect-video w-full max-w-sm rounded-lg overflow-hidden border">
                                            <img
                                                src={imageFile ? URL.createObjectURL(imageFile) : field.value || ""}
                                                alt="Preview"
                                                className="object-cover w-full h-full"
                                            />
                                        </div>
                                    )}
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Status" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="DRAFT">Draft</SelectItem>
                                    <SelectItem value="PUBLISHED">Published</SelectItem>
                                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="excerpt"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Short Excerpt</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Brief summary needed for previews..."
                                    className="h-20"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Shown on the homepage card.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Content</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Full article content (Markdown supported)..."
                                    className="min-h-[300px]"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Saving..." : isid ? "Update Article" : "Create Article"}
                </Button>
            </form>
        </Form>
    );
}
