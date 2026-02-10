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
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Timestamp } from "firebase/firestore";

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
    registrationOpenHours: z.coerce.number().min(0).optional().default(48),
    registrationCloseHours: z.coerce.number().min(0).optional().default(2),
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

    // Helper: Safely format Timestamp/Date to datetime-local string (YYYY-MM-DDTHH:mm)
    const formatDate = (date: Timestamp | Date | string | null | undefined): string => {
        if (!date) return "";
        let d: Date;
        if (typeof date === 'object' && 'toDate' in date) {
            d = date.toDate();
        } else {
            d = new Date(date as string | Date | number);
        }
        if (isNaN(d.getTime())) return "";

        // Adjust for local timezone offset manually to prevent UTC shift
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
        return localISOTime;
    };

    // Helper: Calculate hours before start
    const calcHours = (startVal: Timestamp | Date | string | undefined | null, triggerVal: Timestamp | Date | string | undefined | null): number => {
        if (!startVal || !triggerVal) return 0;
        const start = typeof startVal === 'object' && 'toDate' in startVal ? startVal.toDate() : new Date(startVal as any);
        const trigger = typeof triggerVal === 'object' && 'toDate' in triggerVal ? triggerVal.toDate() : new Date(triggerVal as any);

        const diffMs = start.getTime() - trigger.getTime();
        const hours = diffMs / (1000 * 60 * 60);
        return Math.max(0, Math.round(hours * 10) / 10); // Round to 1 decimal
    };

    const form = useForm<EventFormValues>({
        resolver: zodResolver(eventSchema) as any,
        defaultValues: {
            title: initialData?.title || "",
            description: initialData?.description || "",
            category: initialData?.category || "WEEKLY_SPORTS",
            sportId: initialData?.sportId || "",
            locationId: initialData?.locationId || "",
            startTime: formatDate(initialData?.startTime),
            endTime: formatDate(initialData?.endTime),
            capacity: initialData?.capacity || 20,
            tokensRequired: initialData?.tokensRequired || 0,
            genderPolicy: initialData?.genderPolicy || "ALL",
            status: initialData?.status || "DRAFT",
            isPublic: initialData?.isPublic !== undefined ? initialData.isPublic : true,
            imageUrl: initialData?.imageUrl || "",
            addressUrl: initialData?.addressUrl || "",
            guestFee: initialData?.guestFee || 0,
            recurrenceRule: initialData?.recurrenceRule || "NONE",
            registrationOpenHours: (initialData?.startTime && initialData?.registrationStart)
                ? calcHours(initialData.startTime, initialData.registrationStart)
                : 48,
            registrationCloseHours: (initialData?.startTime && initialData?.registrationEnd)
                ? calcHours(initialData.startTime, initialData.registrationEnd)
                : 2,
            customSignupUrl: initialData?.customSignupUrl || "",
        },
    });

    useEffect(() => {
        if (initialData) {
            form.reset({
                title: initialData.title || "",
                description: initialData.description || "",
                category: initialData.category || "WEEKLY_SPORTS",
                sportId: initialData.sportId || "",
                locationId: initialData.locationId || "",
                startTime: formatDate(initialData.startTime),
                endTime: formatDate(initialData.endTime),
                capacity: initialData.capacity || 20,
                tokensRequired: initialData.tokensRequired || 0,
                genderPolicy: initialData.genderPolicy || "ALL",
                status: initialData.status || "DRAFT",
                isPublic: initialData.isPublic !== undefined ? initialData.isPublic : true,
                imageUrl: initialData.imageUrl || "",
                addressUrl: initialData.addressUrl || "",
                guestFee: initialData.guestFee || 0,
                recurrenceRule: initialData.recurrenceRule || "NONE",
                registrationOpenHours: (initialData.startTime && initialData.registrationStart)
                    ? calcHours(initialData.startTime, initialData.registrationStart)
                    : 48,
                registrationCloseHours: (initialData.startTime && initialData.registrationEnd)
                    ? calcHours(initialData.startTime, initialData.registrationEnd)
                    : 2,
                customSignupUrl: initialData.customSignupUrl || "",
            });
        }
    }, [initialData, form]);

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

    async function onSubmit(data: EventFormValues) {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const url = isid ? `/api/events/${isid}` : "/api/events";
            const method = isid ? "PUT" : "POST";

            let finalImageUrl = data.imageUrl;

            if (imageFile) {
                setUploading(true);
                // Convert to Base64 string instead of uploading to Storage
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

            // Calculate actual timestamps from hours
            const startDate = new Date(data.startTime);
            const regStart = new Date(startDate.getTime() - (data.registrationOpenHours || 0) * 60 * 60 * 1000);
            const regEnd = new Date(startDate.getTime() - (data.registrationCloseHours || 0) * 60 * 60 * 1000);

            const payload = {
                ...data,
                imageUrl: finalImageUrl,
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

                {/* --- Video Banner Section (Moved to Top) --- */}


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
                                    <Input
                                        type="datetime-local"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value || ""}
                                        onChange={field.onChange}
                                    />
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
                                    <Input
                                        type="datetime-local"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value || ""}
                                        onChange={field.onChange}
                                    />
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
                                    <Input
                                        type="number"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value === undefined || field.value === null ? "" : field.value}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                    />
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
                                    <Input
                                        type="number"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value === undefined || field.value === null ? "" : field.value}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                    />
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
                                    <Input
                                        type="number"
                                        step="0.01"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value === undefined || field.value === null ? "" : field.value}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                    />
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
                                    <Input
                                        type="number"
                                        step="0.5"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value === undefined || field.value === null ? "" : field.value}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                    />
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
                                    <Input
                                        type="number"
                                        step="0.5"
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value === undefined || field.value === null ? "" : field.value}
                                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                    />
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


