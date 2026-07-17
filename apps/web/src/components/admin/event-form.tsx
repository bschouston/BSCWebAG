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
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebase/client";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Timestamp } from "firebase/firestore";
import { Trash2, Upload, Loader2 as SpinIcon } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { isValidEventSlug, slugifyEventTitle } from "@/lib/events/slugify";

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
    registrationStart: z.string().optional(), // datetime-local string
    registrationEnd: z.string().optional(),   // datetime-local string
    customSignupUrl: z.string().optional(),
    registrationFormType: z.string().optional(),
    registrationFormId: z.string().optional(),
    
    // Featured Event Fields
    slug: z
        .string()
        .optional()
        .refine(
            (val) => !val || !val.trim() || isValidEventSlug(slugifyEventTitle(val)),
            { message: "Use lowercase letters, numbers, and hyphens only" }
        ),
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
    historyDetails: z.string().optional(),

    // Tournament detail fields
    registrationDeadline: z.string().min(1, "Registration deadline is required").optional(),
    refundPolicy: z.string().optional(),
    tournamentFormat: z.string().optional(),
    teamCap: z.coerce.number().optional(),
    prizePool: z.coerce.number().optional(),
    prizeNote: z.string().optional(),

    showLocation: z.boolean().default(true),
    showGender: z.boolean().default(true),
    showAgeRestriction: z.boolean().default(true),
    showLocale: z.boolean().default(true),
    showRegistrationFees: z.boolean().default(true),
    showSponsorshipTiers: z.boolean().default(true),
    showPhotoGallery: z.boolean().default(true),
    showHistory: z.boolean().default(true),
    showRegistrationDeadline: z.boolean().default(true),
    showRefundPolicy: z.boolean().default(true),
    showTournamentFormat: z.boolean().default(true),
    showTeamCap: z.boolean().default(true),
    showPrizePool: z.boolean().default(true),
    showDonation: z.boolean().default(false),
    showRegisteredPlayers: z.boolean().default(false),
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
    const [photoUrls, setPhotoUrls] = useState<string[]>((initialData as any)?.photoUrls ?? []);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [templateForms, setTemplateForms] = useState<{ id: string; name: string; slug: string }[]>([]);

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

    const defaultStartTime = formatDate(initialData?.startTime);
    const defaultRegStart = formatDate(initialData?.registrationStart) || (() => {
        if (!defaultStartTime) return "";
        const start = new Date(defaultStartTime);
        return formatDate(new Date(start.getTime() - 48 * 60 * 60 * 1000));
    })();
    const defaultRegEnd = formatDate(initialData?.registrationEnd) || (() => {
        if (!defaultStartTime) return "";
        const start = new Date(defaultStartTime);
        return formatDate(new Date(start.getTime() - 2 * 60 * 60 * 1000));
    })();

    const defaultValuesObj = {
        title: initialData?.title || "",
        description: initialData?.description || "",
        category: initialData?.category || "WEEKLY_SPORTS",
        sportId: initialData?.sportId || "",
        locationId: initialData?.locationId || "",
        startTime: defaultStartTime,
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
        registrationStart: defaultRegStart,
        registrationEnd: defaultRegEnd,
        customSignupUrl: initialData?.customSignupUrl || "",
        registrationFormType: initialData?.registrationFormType || "standard",
        registrationFormId: (initialData as any)?.registrationFormId || "",
        slug: initialData?.slug || "",
        eventLocation: initialData?.eventLocation || "",
        ageRestriction: initialData?.ageRestriction || "",
        participationLocale: initialData?.participationLocale || "",
        historyDetails: initialData?.historyDetails || "",
        registrationDeadline: (initialData as any)?.registrationDeadline || "",
        refundPolicy: (initialData as any)?.refundPolicy || "",
        tournamentFormat: (initialData as any)?.tournamentFormat || "",
        teamCap: (initialData as any)?.teamCap || undefined,
        prizePool: (initialData as any)?.prizePool || undefined,
        prizeNote: (initialData as any)?.prizeNote || "",
        showLocation: initialData?.showLocation ?? true,
        showGender: initialData?.showGender ?? true,
        showAgeRestriction: initialData?.showAgeRestriction ?? true,
        showLocale: initialData?.showLocale ?? true,
        showRegistrationFees: initialData?.showRegistrationFees ?? true,
        showSponsorshipTiers: initialData?.showSponsorshipTiers ?? true,
        showPhotoGallery: initialData?.showPhotoGallery ?? true,
        showHistory: initialData?.showHistory ?? true,
        showRegistrationDeadline: (initialData as any)?.showRegistrationDeadline ?? true,
        showRefundPolicy: (initialData as any)?.showRefundPolicy ?? true,
        showTournamentFormat: (initialData as any)?.showTournamentFormat ?? true,
        showTeamCap: (initialData as any)?.showTeamCap ?? true,
        showPrizePool: (initialData as any)?.showPrizePool ?? true,
        showDonation: (initialData as any)?.showDonation ?? false,
        showRegisteredPlayers: (initialData as any)?.showRegisteredPlayers ?? false,
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

    useEffect(() => {
        if (!user) return;
        void (async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch("/api/admin/registration-forms", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    const list = (data.forms ?? [])
                        .filter((f: { status?: string }) => f.status !== "ARCHIVED")
                        .map((f: { id: string; name: string; slug: string }) => ({
                            id: f.id,
                            name: f.name,
                            slug: f.slug,
                        }));
                    setTemplateForms(list);
                    const currentId = form.getValues("registrationFormId");
                    if (
                        !currentId &&
                        form.getValues("registrationFormType") === "volleyball"
                    ) {
                        const vb = list.find((t: { slug: string }) => t.slug === "volleyball");
                        if (vb) form.setValue("registrationFormId", vb.id);
                    }
                }
            } catch {
                // ignore — dropdown falls back to standard only
            }
        })();
    }, [user]);

    const MAX_PHOTO_MB = 20;

    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

    const handlePhotoUpload = async (files: FileList) => {
        setPhotoError(null);
        const toUpload = Array.from(files);
        for (const file of toUpload) {
            if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
                setPhotoError(`"${file.name}" exceeds ${MAX_PHOTO_MB} MB. Please choose a smaller file.`);
                return;
            }
        }
        setPhotoUploading(true);
        try {
            const token = await user?.getIdToken();
            const uploaded: string[] = [];
            for (const file of toUpload) {
                // Never overwrite existing: include timestamp + random suffix
                const safeName = file.name.replace(/[^\w.\-]+/g, "_");
                const path = `event-photos/${isid ?? "new"}/${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2)}_${safeName}`;
                const fileRef = storageRef(storage, path);
                await uploadBytes(fileRef, file);
                const url = await getDownloadURL(fileRef);
                uploaded.push(url);
            }
            setPhotoUrls((prev) => [...prev, ...uploaded]);
        } catch (err) {
            console.error("Photo upload failed", err);
            setPhotoError("Upload failed. Please try again.");
        } finally {
            setPhotoUploading(false);
        }
    };

    const handleRemovePhoto = async (url: string) => {
        setPhotoUrls((prev) => prev.filter((u) => u !== url));
        // Best-effort delete from Storage
        try {
            const fileRef = storageRef(storage, url);
            await deleteObject(fileRef);
        } catch {
            // Ignore — URL might not be a Storage path
        }
    };

    async function onSubmit(data: EventFormValues) {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const url = isid ? `/api/events/${isid}` : "/api/events";
            const method = isid ? "PUT" : "POST";

            let finalImageUrl = data.imageUrl;

            if (imageFile) {
                // Keep original quality (no compression) and store as Storage URL
                try {
                    const ext = imageFile.name.includes(".")
                        ? imageFile.name.split(".").pop()
                        : "jpg";
                    const path = `events/${isid ?? "new"}_${Date.now()}_${Math.random()
                        .toString(36)
                        .slice(2)}.${ext}`;
                    const coverRef = storageRef(storage, path);
                    await uploadBytes(coverRef, imageFile, { contentType: imageFile.type || "image/jpeg" });
                    finalImageUrl = await getDownloadURL(coverRef);
                } catch (err) {
                    console.error("Failed to process image", err);
                    alert("Failed to upload cover image.");
                    setLoading(false);
                    return;
                }
            }

            const regStart = data.registrationStartAsap
                ? new Date()
                : data.registrationStart
                  ? new Date(data.registrationStart)
                  : null;
            const regEnd = data.registrationEnd ? new Date(data.registrationEnd) : null;

            const formId = data.registrationFormId?.trim() || null;
            const normalizedSlug =
                slugifyEventTitle(data.slug || "") ||
                slugifyEventTitle(data.title || "") ||
                undefined;
            const payload = {
                ...data,
                slug: normalizedSlug,
                imageUrl: finalImageUrl,
                recurrenceRule: data.recurrenceRule === "NONE" ? null : data.recurrenceRule,
                registrationStart: regStart ? regStart.toISOString() : null,
                registrationEnd: regEnd ? regEnd.toISOString() : null,
                registrationFormId: formId,
                registrationFormType: formId
                    ? templateForms.find((t) => t.id === formId)?.slug === "volleyball"
                        ? "volleyball"
                        : "dynamic"
                    : data.registrationFormType === "volleyball"
                      ? "volleyball"
                      : "standard",
                sponsorshipTiers: data.sponsorshipTiers?.map(tier => ({
                    ...tier,
                    features: tier.features ? tier.features.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0) : []
                })),
                photoUrls,
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
                        name="slug"
                        render={({ field }) => {
                            const previewSlug =
                                slugifyEventTitle(field.value || "") ||
                                slugifyEventTitle(form.watch("title") || "") ||
                                "your-event-slug";
                            return (
                                <FormItem className="col-span-2">
                                    <FormLabel>Public Page URL</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="summer-tournament-2026"
                                            {...field}
                                            onBlur={(e) => {
                                                field.onBlur();
                                                const normalized = slugifyEventTitle(e.target.value);
                                                if (normalized !== e.target.value) {
                                                    field.onChange(normalized);
                                                }
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Shareable landing page link:{" "}
                                        <span className="font-mono text-foreground">
                                            /events/{previewSlug}
                                        </span>
                                        . Leave blank to auto-generate from the title.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            );
                        }}
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
                            name="registrationStart"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Opens</FormLabel>
                                    <FormControl>
                                        <Input type="datetime-local" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        When registration becomes available
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                    <FormField
                        control={form.control}
                        name="registrationEnd"
                        render={({ field }) => (
                            <FormItem className={form.watch("registrationStartAsap") ? "col-span-2 sm:col-span-1" : undefined}>
                                <FormLabel>Closes</FormLabel>
                                <FormControl>
                                    <Input type="datetime-local" {...field} />
                                </FormControl>
                                <FormDescription>
                                    When registration closes
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
                            name="registrationFormId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Registration Form Template</FormLabel>
                                    <Select
                                        value={field.value || "standard"}
                                        onValueChange={(v) => {
                                            if (v === "standard") {
                                                field.onChange("");
                                                form.setValue("registrationFormType", "standard");
                                            } else {
                                                field.onChange(v);
                                                const slug = templateForms.find((t) => t.id === v)?.slug;
                                                form.setValue(
                                                    "registrationFormType",
                                                    slug === "volleyball" ? "volleyball" : "dynamic"
                                                );
                                            }
                                        }}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a template" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard Event RSVP</SelectItem>
                                            {templateForms.map((t) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Reusable form templates from Admin → Tournaments → Registration Forms.
                                        Submissions are stored on this event.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {!form.watch("registrationFormId") && (
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
                        {/* Age / Locale */}
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
                        </div>

                        {/* Tournament Details */}
                        <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                            <h4 className="font-medium text-sm">Tournament Details</h4>

                            {/* Registration Deadline — required */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="registrationDeadline" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Registration Deadline <span className="text-destructive">*</span></FormLabel>
                                        <FormControl><Input type="date" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="showRegistrationDeadline" render={({ field }) => (
                                    <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal cursor-pointer">Show on Page</FormLabel>
                                    </FormItem>
                                )}/>
                            </div>

                            {/* Tournament Format */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="tournamentFormat" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tournament Format</FormLabel>
                                        <FormControl><Input placeholder="E.g. 6v6 3-Touch · Double Elimination" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="showTournamentFormat" render={({ field }) => (
                                    <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal cursor-pointer">Show on Page</FormLabel>
                                    </FormItem>
                                )}/>
                            </div>

                            {/* Team Cap */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="teamCap" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Team Cap</FormLabel>
                                        <FormControl><Input type="number" placeholder="E.g. 12" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="showTeamCap" render={({ field }) => (
                                    <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal cursor-pointer">Show on Page</FormLabel>
                                    </FormItem>
                                )}/>
                            </div>

                            {/* Prize Pool */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="prizePool" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Prize Pool ($)</FormLabel>
                                        <FormControl><Input type="number" placeholder="E.g. 2786" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="showPrizePool" render={({ field }) => (
                                    <FormItem className="flex flex-row items-end space-x-2 pb-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal cursor-pointer">Show on Page</FormLabel>
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="prizeNote" render={({ field }) => (
                                    <FormItem className="col-span-2">
                                        <FormLabel>Prize Note</FormLabel>
                                        <FormControl><Input placeholder="E.g. to winning team's owner" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </div>

                            {/* Refund Policy */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="refundPolicy" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Refund Policy</FormLabel>
                                        <FormControl><Textarea placeholder="Describe the refund policy..." {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="showRefundPolicy" render={({ field }) => (
                                    <FormItem className="flex flex-row items-start pt-2 space-x-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal cursor-pointer">Show on Page</FormLabel>
                                    </FormItem>
                                )}/>
                            </div>
                        </div>

                        {/* Photo Gallery Upload */}
                        <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm">Highlights in the Event</h4>
                                <FormField control={form.control} name="showPhotoGallery" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <FormLabel className="font-normal text-xs cursor-pointer">Show Highlights</FormLabel>
                                    </FormItem>
                                )}/>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">
                                    Max {MAX_PHOTO_MB} MB per image · All image formats accepted
                                </label>
                                <div className="flex items-center gap-2">
                                    <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors hover:bg-muted ${photoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                                        {photoUploading ? <SpinIcon className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        {photoUploading ? "Uploading…" : "Upload Highlights"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files) handlePhotoUpload(e.target.files);
                                                // Allow selecting the same files again
                                                e.currentTarget.value = "";
                                            }}
                                            disabled={photoUploading}
                                        />
                                    </label>
                                    {photoError && <p className="text-xs text-destructive">{photoError}</p>}
                                </div>

                                {photoUrls.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                {photoUrls.length} highlight{photoUrls.length !== 1 ? "s" : ""}
                                            </span>
                                            <div className="flex gap-2">
                                                <Button type="button" variant="outline" size="sm" onClick={scrollPrev}>
                                                    Prev
                                                </Button>
                                                <Button type="button" variant="outline" size="sm" onClick={scrollNext}>
                                                    Next
                                                </Button>
                                            </div>
                                        </div>

                                        <div ref={emblaRef} className="overflow-hidden rounded-md border bg-muted/20">
                                            <div className="flex">
                                                {photoUrls.map((url, i) => (
                                                    <div
                                                        key={url}
                                                        className="relative group flex-[0_0_85%] sm:flex-[0_0_60%] md:flex-[0_0_45%] p-2"
                                                    >
                                                        <div className="relative aspect-video rounded-md overflow-hidden border bg-muted">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={url} alt={`Highlight ${i + 1}`} className="w-full h-full object-cover" />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemovePhoto(url)}
                                                                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                                aria-label="Remove photo"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* History */}
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

                        {/* DONATION SECTION */}
                        <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm">Donation Section</h4>
                                <FormField
                                    control={form.control}
                                    name="showDonation"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                            <FormControl>
                                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <FormLabel className="font-normal text-xs cursor-pointer">
                                                Show on Event Page
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                                <p className="font-semibold text-foreground">Donate to Burhani Sports Club</p>
                                <p>
                                    Burhani Sports Club is built on more than sports — it is built on community,
                                    connection, and khidmat. Your donation helps us continue that mission in ways
                                    that reach far beyond the game itself.
                                </p>
                                <p>
                                    Not every event or initiative has the same level of funding, and your generosity
                                    helps us bridge those gaps so that meaningful programs can continue without
                                    compromise. Donations support niyaz at events, help us send mumineen to KUN, and
                                    make many other acts of khidmat possible throughout the year.
                                </p>
                                <p>
                                    By giving to BSC, you are helping create spaces where people can gather,
                                    participate, and benefit together. You are helping us serve where needed most,
                                    support our community with dignity, and keep these efforts moving forward. Every
                                    donation is a chance to be part of something larger — a shared commitment to
                                    service, unity, and barakat.
                                </p>
                            </div>
                        </div>

                        {/* REGISTERED PLAYERS */}
                        <div className="space-y-4 border p-4 rounded-md bg-muted/10">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm">Registered Players Section</h4>
                                <FormField
                                    control={form.control}
                                    name="showRegisteredPlayers"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                            <FormControl>
                                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <FormLabel className="font-normal text-xs cursor-pointer">
                                                Show on Event Page
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="text-sm text-muted-foreground leading-relaxed">
                                Shows a public list of currently registered players (name, jamaat, age).
                            </div>
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


