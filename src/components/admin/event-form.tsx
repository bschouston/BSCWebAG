"use client";

import { useForm, useFieldArray } from "react-hook-form";
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
    registrationStartAsap: z.boolean().default(false).optional(),
    // Changed to relative hours
    registrationOpenHours: z.coerce.number().min(0).optional().default(48),
    registrationCloseHours: z.coerce.number().min(0).optional().default(2),
    customSignupUrl: z.string().optional(),
    registrationFormType: z.string().optional(),
    
    // Featured Event Fields
    slug: z.string().optional(),
    eventLocation: z.string().optional(),
    ageRestriction: z.string().optional(),
    participationLocale: z.string().optional(),
    registrationFees: z.array(z.object({
        type: z.string(),
        amount: z.coerce.number(),
        description: z.string().optional()
    })).optional(),
    sponsorshipTiers: z.array(z.object({
        name: z.string(),
        cost: z.coerce.number(),
        features: z.string().optional() // String to be split by comma
    })).optional(),
    photoGalleryUrl: z.string().optional(),
    historyDetails: z.string().optional(),

    showLocation: z.boolean().default(true),
    showGender: z.boolean().default(true),
    showAgeRestriction: z.boolean().default(true),
    showLocale: z.boolean().default(true),
    showRegistrationFees: z.boolean().default(true),
    showSponsorshipTiers: z.boolean().default(true),
    showPhotoGallery: z.boolean().default(true),
    showHistory: z.boolean().default(true),
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
        const start = typeof startVal === 'object' && 'toDate' in startVal ? startVal.toDate() : new Date(startVal as string | number | Date);
        const trigger = typeof triggerVal === 'object' && 'toDate' in triggerVal ? triggerVal.toDate() : new Date(triggerVal as string | number | Date);

        const diffMs = start.getTime() - trigger.getTime();
        const hours = diffMs / (1000 * 60 * 60);
        return Math.max(0, Math.round(hours * 10) / 10); // Round to 1 decimal
    };

    const defaultValuesObj = {
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
        registrationStartAsap: false,
        registrationOpenHours: (initialData?.startTime && initialData?.registrationStart)
            ? calcHours(initialData.startTime, initialData.registrationStart)
            : 48,
        registrationCloseHours: (initialData?.startTime && initialData?.registrationEnd)
            ? calcHours(initialData.startTime, initialData.registrationEnd)
            : 2,
        customSignupUrl: initialData?.customSignupUrl || "",
        registrationFormType: initialData?.registrationFormType || "standard",
        slug: initialData?.slug || "",
        eventLocation: initialData?.eventLocation || "",
        ageRestriction: initialData?.ageRestriction || "",
        participationLocale: initialData?.participationLocale || "",
        photoGalleryUrl: initialData?.photoGalleryUrl || "",
        historyDetails: initialData?.historyDetails || "",
        showLocation: initialData?.showLocation ?? true,
        showGender: initialData?.showGender ?? true,
        showAgeRestriction: initialData?.showAgeRestriction ?? true,
        showLocale: initialData?.showLocale ?? true,
        showRegistrationFees: initialData?.showRegistrationFees ?? true,
        showSponsorshipTiers: initialData?.showSponsorshipTiers ?? true,
        showPhotoGallery: initialData?.showPhotoGallery ?? true,
        showHistory: initialData?.showHistory ?? true,
        registrationFees: initialData?.registrationFees || [],
        sponsorshipTiers: initialData?.sponsorshipTiers?.map(t => ({
            ...t,
            features: t.features?.join(', ') || ""
        })) || [],
    };

    const form = useForm<EventFormValues>({
         
        resolver: zodResolver(eventSchema) as any,
        defaultValues: defaultValuesObj,
    });

    const { fields: feeFields, append: appendFee, remove: removeFee } = useFieldArray({
        control: form.control,
        name: "registrationFees"
    });

    const { fields: sponsorFields, append: appendSponsor, remove: removeSponsor } = useFieldArray({
        control: form.control,
        name: "sponsorshipTiers"
    });

    useEffect(() => {
        if (initialData) {
            form.reset(defaultValuesObj);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                // Convert to Base64 string instead of uploading to Storage
                try {
                    finalImageUrl = await resizeImage(imageFile);
                } catch (err) {
                    console.error("Failed to process image", err);
                    alert("Failed to process image. Please try a smaller file.");
                    setLoading(false);
                    return;
                }
            }

            // Calculate actual timestamps from hours
            const startDate = new Date(data.startTime);
            const regStart = data.registrationStartAsap
                ? new Date()
                : new Date(startDate.getTime() - (data.registrationOpenHours || 0) * 60 * 60 * 1000);
            const regEnd = new Date(startDate.getTime() - (data.registrationCloseHours || 0) * 60 * 60 * 1000);

            const payload = {
                ...data,
                imageUrl: finalImageUrl,
                recurrenceRule: data.recurrenceRule === "NONE" ? null : data.recurrenceRule,
                registrationStart: regStart.toISOString(),
                registrationEnd: regEnd.toISOString(),
                sponsorshipTiers: data.sponsorshipTiers?.map(tier => ({
                    ...tier,
                    features: tier.features ? tier.features.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0) : []
                }))
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
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
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
                                <FormLabel>Sport Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Sport" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="badminton">Badminton</SelectItem>
                                        <SelectItem value="basketball">Basketball</SelectItem>
                                        <SelectItem value="cricket">Cricket</SelectItem>
                                        <SelectItem value="padel">Padel</SelectItem>
                                        <SelectItem value="soccer">Soccer</SelectItem>
                                        <SelectItem value="tennis">Tennis</SelectItem>
                                        <SelectItem value="volleyball">Volleyball</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
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

                {form.watch("category") === "WEEKLY_SPORTS" && (
                    <>
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

                        {/* --- Fees --- */}
                        <div className="grid grid-cols-2 gap-4">
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
                    </>
                )}

                {/* --- Capacity --- */}
                <div className="grid grid-cols-2 gap-4">
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
                </div>

                {/* --- Registration Window --- */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                    <div className="col-span-2 flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">Registration Window</span>
                        <FormField
                            control={form.control}
                            name="registrationStartAsap"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Start ASAP</FormLabel>
                                </FormItem>
                            )}
                        />
                    </div>
                    {!form.watch("registrationStartAsap") && (
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
                    )}
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
                    <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                        <FormField
                            control={form.control}
                            name="registrationFormType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Registration Form Template</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value || "standard"}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a template" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard Event RSVP</SelectItem>
                                            <SelectItem value="volleyball">Volleyball Registration Form</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Choose a specific form template for users to fill out when clicking Register.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {form.watch("registrationFormType") !== "volleyball" && (
                            <FormField
                                control={form.control}
                                name="customSignupUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>External Sign Up Link (Optional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="https://form.jotform.com/..." {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            If provided, users go directly to this link instead of the internal RSVP page.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>
                )}

                {/* FEATURED EVENT DETAILS */}
                {form.watch("category") === "FEATURED_EVENTS" && (
                    <div className="space-y-6 border-t pt-4">
                        <h3 className="text-lg font-semibold">Featured Event Specific Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="eventLocation" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Event Location String</FormLabel>
                                    <FormControl><Input placeholder="E.g. Central Stadium" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="showLocation" render={({ field }) => (
                                <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Show on Landing Page</FormLabel>
                                </FormItem>
                            )}/>
                        </div>
                        {/* More Fields (Age, Locale, Gallery) */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="ageRestriction" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Age Restriction</FormLabel>
                                    <FormControl><Input placeholder="E.g. Youth (Under 18), Adults" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="showAgeRestriction" render={({ field }) => (
                                <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Show Age Restriction</FormLabel>
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="participationLocale" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Participation Locale</FormLabel>
                                    <FormControl><Input placeholder="E.g. Local, National, International" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="showLocale" render={({ field }) => (
                                <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Show Locale</FormLabel>
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="photoGalleryUrl" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Photo Gallery URL (External Link)</FormLabel>
                                    <FormControl><Input placeholder="https://photos.google.com/..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="showPhotoGallery" render={({ field }) => (
                                <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Show Photo Gallery</FormLabel>
                                </FormItem>
                            )}/>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="historyDetails" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Event History / Background</FormLabel>
                                    <FormControl><Textarea placeholder="History of the event..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="showHistory" render={({ field }) => (
                                <FormItem className="flex flex-row items-start pt-2 space-x-2">
                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Show History</FormLabel>
                                </FormItem>
                            )}/>
                        </div>

                        {/* FEES */}
                        <div className="space-y-4 border p-4 rounded-md">
                            <div className="flex justify-between items-center">
                                <h4 className="font-medium text-sm">Registration Fees</h4>
                                <div className="flex space-x-4">
                                    <FormField control={form.control} name="showRegistrationFees" render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                            <FormLabel className="font-normal text-xs cursor-pointer">Show Fees</FormLabel>
                                        </FormItem>
                                    )}/>
                                </div>
                            </div>
                            {feeFields.map((item, index) => (
                                <div key={item.id} className="flex space-x-2 items-start">
                                    <FormField control={form.control} name={`registrationFees.${index}.type` as const} render={({field}) => (
                                        <FormItem className="flex-1"><FormControl><Input placeholder="Type (e.g. Early Bird)" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`registrationFees.${index}.amount` as const} render={({field}) => (
                                        <FormItem className="w-24"><FormControl><Input type="number" placeholder="Amt" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`registrationFees.${index}.description` as const} render={({field}) => (
                                        <FormItem className="flex-2"><FormControl><Input placeholder="Description" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <Button type="button" variant="destructive" size="sm" onClick={() => removeFee(index)}>X</Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => appendFee({ type: "", amount: 0, description: "" })}>+ Add Fee</Button>
                        </div>

                        {/* SPONSORSHIPS */}
                        <div className="space-y-4 border p-4 rounded-md">
                            <div className="flex justify-between items-center">
                                <h4 className="font-medium text-sm">Sponsorship Tiers</h4>
                                <div className="flex space-x-4">
                                    <FormField control={form.control} name="showSponsorshipTiers" render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                            <FormLabel className="font-normal text-xs cursor-pointer">Show Sponsors</FormLabel>
                                        </FormItem>
                                    )}/>
                                </div>
                            </div>
                            {sponsorFields.map((item, index) => (
                                <div key={item.id} className="flex space-x-2 items-start">
                                    <FormField control={form.control} name={`sponsorshipTiers.${index}.name` as const} render={({field}) => (
                                        <FormItem className="flex-1"><FormControl><Input placeholder="Name (e.g. Gold)" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`sponsorshipTiers.${index}.cost` as const} render={({field}) => (
                                        <FormItem className="w-24"><FormControl><Input type="number" placeholder="Cost" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <FormField control={form.control} name={`sponsorshipTiers.${index}.features` as const} render={({field}) => (
                                        <FormItem className="flex-2"><FormControl><Input placeholder="Features (comma sep)" {...field}/></FormControl><FormMessage/></FormItem>
                                    )}/>
                                    <Button type="button" variant="destructive" size="sm" onClick={() => removeSponsor(index)}>X</Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => appendSponsor({ name: "", cost: 0, features: "" })}>+ Add Sponsor</Button>
                        </div>
                    </div>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Saving..." : isid ? "Update Event" : "Create Event"}
                </Button>
            </form>
        </Form>
    );
}


