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
import { Checkbox } from "@/components/ui/checkbox";
import { SportEvent } from "@/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const eventSchema = z.object({
    title: z.string().min(2, "Title must be at least 2 characters"),
    description: z.string().optional(),
    category: z.enum(["WEEKLY_SPORTS", "MONTHLY_EVENTS", "FEATURED_EVENTS"]),
    sportId: z.string().min(1, "Sport ID is required"),
    locationId: z.string().optional(),
    startTime: z.string(), // datetime-local string
    endTime: z.string(),   // datetime-local string
    capacity: z.coerce.number().min(1),
    tokensRequired: z.coerce.number().min(0),
    genderPolicy: z.enum(["ALL", "MALE_ONLY", "FEMALE_ONLY"]),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]),
    isPublic: z.boolean().default(true),

    // New Fields
    imageUrl: z.string().optional(),
    addressUrl: z.string().optional(),
    guestFee: z.coerce.number().optional(),
    recurrenceRule: z.string().optional(),
    // Changed to relative hours
    registrationOpenHours: z.coerce.number().min(0).optional(),
    registrationCloseHours: z.coerce.number().min(0).optional(),
    customSignupUrl: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

interface EventFormProps {
    initialData?: SportEvent;
    isid?: string; // If editing
}

export function EventForm({ initialData, isid }: EventFormProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    // ... helper functions

    const form = useForm<EventFormValues>({
        // ... resolver
        defaultValues: initialData ? {
            // ... existing
            imageUrl: initialData.imageUrl || "",
            // ...
        } : {
            // ... defaults
            imageUrl: "",
            // ...
        },
    });

    async function onSubmit(data: EventFormValues) {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const url = isid ? `/api/events/${isid}` : "/api/events";
            const method = isid ? "PUT" : "POST";

            let finalImageUrl = data.imageUrl;

            if (imageFile) {
                setUploading(true);
                const storageRef = ref(storage, `events/${Date.now()}_${imageFile.name}`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                finalImageUrl = await getDownloadURL(snapshot.ref);
                setUploading(false);
            }

            // Calculate actual timestamps from hours
            const startDate = new Date(data.startTime);
            const regStart = new Date(startDate.getTime() - (data.registrationOpenHours || 0) * 60 * 60 * 1000);
            const regEnd = new Date(startDate.getTime() - (data.registrationCloseHours || 0) * 60 * 60 * 1000);

            const payload = {
                ...data,
                imageUrl: finalImageUrl,
                // Clean up optional fields if empty strings
                recurrenceRule: data.recurrenceRule === "NONE" ? null : data.recurrenceRule,
                registrationStart: regStart.toISOString(),
                registrationEnd: regEnd.toISOString(),
            };

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            // ... rest of error handling


            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save event");
            }

            router.push("/admin/events");
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

                {/* --- Basic Info --- */}
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Event Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="Weekly Badminton" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="imageUrl"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
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
                                                    src={imageFile ? URL.createObjectURL(imageFile) : field.value}
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="WEEKLY_SPORTS">Weekly Sports</SelectItem>
                                        <SelectItem value="MONTHLY_EVENTS">Monthly Events</SelectItem>
                                        <SelectItem value="FEATURED_EVENTS">Featured Events</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="sportId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Sport ID</FormLabel>
                                <FormControl>
                                    <Input placeholder="badminton, cricket..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Event details..." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* --- Location & Address --- */}
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="locationId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Location Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="Main Court" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="addressUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Map Address URL</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://maps.google.com/..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* --- Timing & Recurrence --- */}
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Start Time</FormLabel>
                                <FormControl>
                                    <Input type="datetime-local" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>End Time</FormLabel>
                                <FormControl>
                                    <Input type="datetime-local" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="recurrenceRule"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Recurrence</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || "NONE"}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Recurrence" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="NONE">None (One-time)</SelectItem>
                                        <SelectItem value="DAILY">Daily</SelectItem>
                                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* --- Capacity & Fees --- */}
                <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="capacity"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Capacity</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="tokensRequired"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Member Tokens</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="guestFee"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Guest Fee ($)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* --- Registration Window --- */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div className="col-span-2 text-sm font-semibold mb-2">Registration Window</div>
                    <FormField
                        control={form.control}
                        name="registrationOpenHours"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Opens (Hours before start)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.5" {...field} />
                                </FormControl>
                                <FormDescription>
                                    e.g., 48 = 2 days before
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="registrationCloseHours"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Closes (Hours before start)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.5" {...field} />
                                </FormControl>
                                <FormDescription>
                                    e.g., 2 = 2 hours before
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* --- Policy & Status --- */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <FormField
                        control={form.control}
                        name="genderPolicy"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Gender Policy</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Policy" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Genders</SelectItem>
                                        <SelectItem value="MALE_ONLY">Male Only</SelectItem>
                                        <SelectItem value="FEMALE_ONLY">Female Only</SelectItem>
                                    </SelectContent>
                                </Select>
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
                                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                        <SelectItem value="COMPLETED">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Public Event?
                                </FormLabel>
                                <FormDescription>
                                    If checked, this event will appear on the public events page.
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />

                {(form.watch("category") === "FEATURED_EVENTS" || form.watch("category") === "MONTHLY_EVENTS") && (
                    <FormField
                        control={form.control}
                        name="customSignupUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Custom Sign Up Link (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://form.jotform.com/..." {...field} />
                                </FormControl>
                                <FormDescription>
                                    If provided, clicking the event will take users directly to this link instead of the internal RSVP page.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Saving..." : isid ? "Update Event" : "Create Event"}
                </Button>
            </form>
        </Form>
    );
}
