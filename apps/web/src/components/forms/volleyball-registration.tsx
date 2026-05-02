"use client";

import { useState, useRef, useEffect } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import SignatureCanvas from "react-signature-canvas";
import { Loader2, AlertCircle, Upload, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { storage } from "@/lib/firebase/client";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const DRAFT_PITCH_MIN_WORDS = 4;
const PLAYER_PHOTO_MAX_MB = 20;
const ITS_REGEX = /^\d{8}$/;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

/** DOM order for scrolling to the first validation error on submit */
const REG_VALIDATION_FIELD_ORDER = [
    "interestedInTeamOwnership",
    "title",
    "firstName",
    "lastName",
    "its",
    "jamaatAffiliation",
    "email",
    "whatsappNumber",
    "studentStatus",
    "dateOfBirth",
    "heightFeet",
    "heightInches",
    "weight",
    "tshirtSize",
    "instagramHandle",
    "isCaptain",
    "playFrequency",
    "strongestPosition",
    "skills.digging",
    "skills.passing",
    "skills.setting",
    "skills.spiking",
    "skills.blocking",
    "skills.serving",
    "injuries",
    "draftPitch",
    "iceFirstName",
    "iceLastName",
    "icePhone",
    "foodAllergies",
] as const;

function collectErrorPaths(node: unknown, prefix = ""): string[] {
    if (!node || typeof node !== "object") return [];
    const obj = node as Record<string, unknown>;
    const paths: string[] = [];
    for (const key of Object.keys(obj)) {
        const child = obj[key];
        const p = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === "object" && child !== null && "message" in child && (child as { message?: string }).message) {
            paths.push(p);
        } else if (child && typeof child === "object" && child !== null && !("message" in child && (child as { message?: string }).message)) {
            paths.push(...collectErrorPaths(child, p));
        }
    }
    return paths;
}

function firstOrderedErrorPath(paths: string[]): string | null {
    const set = new Set(paths);
    for (const p of REG_VALIDATION_FIELD_ORDER) {
        if (set.has(p)) return p;
    }
    return paths[0] ?? null;
}

function registrationFieldScrollTarget(path: string): string | null {
    if (path.startsWith("skills.")) return "reg-anchor-skills";
    if (
        ["title", "firstName", "lastName", "its", "jamaatAffiliation", "email", "whatsappNumber", "studentStatus"].includes(
            path
        )
    )
        return "reg-card-personal";
    if (
        ["dateOfBirth", "heightFeet", "heightInches", "weight", "tshirtSize", "instagramHandle"].includes(path)
    )
        return "reg-card-physical";
    if (["isCaptain", "playFrequency", "strongestPosition", "injuries", "draftPitch"].includes(path))
        return "reg-card-experience";
    if (["iceFirstName", "iceLastName", "icePhone", "foodAllergies"].includes(path)) return "reg-card-emergency";
    if (path === "interestedInTeamOwnership") return "reg-card-team-ownership";
    return null;
}

function scrollToFirstRegistrationError(errors: FieldErrors, setFocus: (name: any) => void) {
    const paths = collectErrorPaths(errors);
    const first = firstOrderedErrorPath(paths);
    if (!first) return;
    try {
        setFocus(first as any);
    } catch {
        /* Select/ref may not support focus */
    }
    requestAnimationFrame(() => {
        const anchorId = registrationFieldScrollTarget(first);
        const el = anchorId ? document.getElementById(anchorId) : null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

const formSchema = z.object({
    title: z.enum(["Bhai", "Mulla", "Shaikh"]),
    firstName: z.string().min(2, "First name is required"),
    lastName: z.string().min(2, "Last name is required"),
    its: z
        .string()
        .trim()
        .regex(ITS_REGEX, "ITS must be exactly 8 digits"),
    studentStatus: z.string().optional(),
    email: z.string().trim().email("Invalid email address"),
    whatsappNumber: z
        .string()
        .trim()
        .refine((v) => {
            const digits = v.replace(/\D/g, "");
            return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
        }, "Enter a valid WhatsApp number (10-15 digits)"),
    jamaatAffiliation: z.string().min(2, "Affiliation is required"),
    dateOfBirth: z.string().min(10, "DOB is required"),
    heightFeet: z.number().min(3).max(8),
    heightInches: z.number().min(0).max(11),
    weight: z.number().min(50).max(400),
    tshirtSize: z.enum(["S", "M", "L", "XL", "XXL", "XXXL"]),
    instagramHandle: z.string().optional(),
    isCaptain: z.enum(["YES", "NO"]),
    playFrequency: z.string(),
    priorExperience: z.array(z.string()).optional(),
    participatedYears: z.array(z.string()).optional(),
    strongestPosition: z.string(),
    skills: z.object({
        digging: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
        passing: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
        setting: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
        spiking: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
        blocking: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
        serving: z.preprocess(
            (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
            z.number().min(1).max(10)
        ),
    }),
    injuries: z.string(),
    draftPitch: z
        .string()
        .optional()
        .refine(
            (v) => !v || v.trim().length === 0 || v.trim().split(/\s+/).filter(Boolean).length >= DRAFT_PITCH_MIN_WORDS,
            `Please write at least ${DRAFT_PITCH_MIN_WORDS} words`
        ),
    ideas: z.string().optional(),
    interestedInTeamOwnership: z.boolean().optional(),
    iceFirstName: z.string().min(2),
    iceLastName: z.string().min(2),
    icePhone: z
        .string()
        .trim()
        .refine((v) => {
            const digits = v.replace(/\D/g, "");
            return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
        }, "Enter a valid ICE phone number (10-15 digits)"),
    foodAllergies: z.string().min(1, "Food allergies is required"),
    playerPhotoUrl: z.string().optional(),
    participationAgreementSignature: z.string().optional(),
    waiverSignature: z.string().optional(),
});

interface VolleyballRegistrationFormProps {
    registrationFee?: number;
    eventTitle?: string;
    registrationEndIso?: string;
    registrationsClosedAtIso?: string;
    registrationDeadline?: string;
}

export function VolleyballRegistrationForm({
    registrationFee,
    eventTitle,
    registrationEndIso,
    registrationsClosedAtIso,
    registrationDeadline,
}: VolleyballRegistrationFormProps) {
    const searchParams = useSearchParams();
    const eventId = searchParams?.get('eventId');
    const editId = searchParams?.get('edit');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingEdit, setIsLoadingEdit] = useState(false);
    const [sigError, setSigError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoPreviewIsObjectUrl, setPhotoPreviewIsObjectUrl] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const editLoadedRef = useRef(false);
    const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
    const [waitlistRegistrationId, setWaitlistRegistrationId] = useState<string | null>(null);
    const [clientNowMs, setClientNowMs] = useState<number | null>(null);
    /** Keeps latest file for submit (avoids rare stale state / iOS picker quirks). */
    const photoFileRef = useRef<File | null>(null);

    const sigPadAgreement = useRef<SignatureCanvas>(null);
    const sigPadWaiver = useRef<SignatureCanvas>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const { resolvedTheme } = useTheme();
    const sigPenColor = resolvedTheme === "dark" ? "#ffffff" : "#000000";
    const sigCanvasBg = resolvedTheme === "dark" ? "#18181b" : "#ffffff";

    const registrationEndMs = registrationEndIso ? Date.parse(registrationEndIso) : NaN;
    const registrationsClosedAtMs = registrationsClosedAtIso ? Date.parse(registrationsClosedAtIso) : NaN;
    const isRegistrationsClosed = Number.isFinite(registrationsClosedAtMs);
    const registrationDeadlineMs = (() => {
        if (!registrationDeadline) return NaN;
        const m = String(registrationDeadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return NaN;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!y || !mo || !d) return NaN;
        const local = new Date(y, mo - 1, d, 23, 59, 0, 0);
        return Number.isNaN(local.getTime()) ? NaN : local.getTime();
    })();

    useEffect(() => {
        // Avoid calling Date.now() during render (react-hooks/purity)
        setClientNowMs(Date.now());
    }, []);

    const isWaitlistMode =
        !isRegistrationsClosed &&
        !editId &&
        ((Number.isFinite(registrationDeadlineMs) && (clientNowMs ?? 0) >= registrationDeadlineMs) ||
            (Number.isFinite(registrationEndMs) && (clientNowMs ?? 0) >= registrationEndMs));

    const isAfterRegistrationEnd = isWaitlistMode;

    const formatDobInput = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(0, 8); // MMDDYYYY
        if (digits.length <= 2) return digits;
        if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
        return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    };

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        mode: "onBlur",
        reValidateMode: "onBlur",
        defaultValues: {
            title: "Bhai",
            firstName: "",
            lastName: "",
            its: "",
            studentStatus: "",
            email: "",
            whatsappNumber: "",
            jamaatAffiliation: "",
            dateOfBirth: "",
            heightFeet: 0,
            heightInches: 0,
            weight: 0,
            tshirtSize: "M",
            instagramHandle: "",
            isCaptain: "NO",
            playFrequency: "Regularly (Once a week or more)",
            priorExperience: [],
            participatedYears: [],
            strongestPosition: "",
            skills: {
                digging: undefined as any,
                passing: undefined as any,
                setting: undefined as any,
                spiking: undefined as any,
                blocking: undefined as any,
                serving: undefined as any,
            },
            injuries: "None",
            draftPitch: "",
            ideas: "",
            interestedInTeamOwnership: false,
            iceFirstName: "",
            iceLastName: "",
            icePhone: "",
            foodAllergies: "",
            playerPhotoUrl: "",
            participationAgreementSignature: "",
            waiverSignature: "",
        },
    });

    useEffect(() => {
        return () => {
            if (photoPreview && photoPreviewIsObjectUrl) URL.revokeObjectURL(photoPreview);
        };
    }, [photoPreview, photoPreviewIsObjectUrl]);

    const isPhotoTooLarge = (file: File) =>
        file.size > PLAYER_PHOTO_MAX_MB * 1024 * 1024;

    const canPreviewAsImage = (file: File) =>
        file.type.startsWith("image/");

    const isImageUrl = (url: string) =>
        /^data:image\//i.test(url) ||
        /firebasestorage\.googleapis\.com/i.test(url) ||
        /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif|pdf)(\?|#|$|%)/i.test(url);

    useEffect(() => {
        if (!editId || !eventId || editLoadedRef.current) return;
        editLoadedRef.current = true;

        // Fetch saved values from Firestore to pre-fill the edit form
        setIsLoadingEdit(true);
        fetch(`/api/events/${eventId}/register?registrationId=${editId}`)
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    // form.reset only picks up fields it knows — extra Firestore fields are safely ignored
                    form.reset(data);
                    if (data.playerPhotoUrl) {
                        // Existing uploaded photo (stored URL)
                        setPhotoFile(null);
                        setPhotoError(null);
                        if (photoPreview && photoPreviewIsObjectUrl) URL.revokeObjectURL(photoPreview);
                        const existingUrl = String(data.playerPhotoUrl);
                        if (isImageUrl(existingUrl)) {
                            setPhotoPreview(existingUrl);
                            setPhotoPreviewIsObjectUrl(false);
                        } else {
                            setPhotoPreview(null);
                            setPhotoPreviewIsObjectUrl(false);
                        }
                    }
                }
            })
            .catch(console.error)
            .finally(() => setIsLoadingEdit(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId, eventId]);

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setSigError(null);
        setFormError(null);
        setPhotoError(null);
        setIsSubmitting(true);

        try {
            const pendingFile = photoFileRef.current ?? photoFile;
            const storedPhotoUrl = (values.playerPhotoUrl || "").trim();
            const hasPhoto = !!pendingFile || !!storedPhotoUrl;

            if (!hasPhoto) {
                setPhotoError("Player photo or document is required.");
                setIsSubmitting(false);
                document.getElementById("player-photo")?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            if (sigPadAgreement.current?.isEmpty()) {
                setSigError("agreement");
                setIsSubmitting(false);
                document.getElementById("sig-agreement")?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }
            if (sigPadWaiver.current?.isEmpty()) {
                setSigError("waiver");
                setIsSubmitting(false);
                document.getElementById("sig-waiver")?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            const agreementSignature = sigPadAgreement.current?.getTrimmedCanvas().toDataURL('image/png');
            const waiverSignature = sigPadWaiver.current?.getTrimmedCanvas().toDataURL('image/png');

            if (!eventId) {
                setFormError("Missing Event ID. Please open this page from the event registration link.");
                setIsSubmitting(false);
                return;
            }

            if (isRegistrationsClosed) {
                setFormError("Registrations are closed for this event.");
                setIsSubmitting(false);
                return;
            }

            // Step 1 — Save registration
            // Do not send empty playerPhotoUrl — it would overwrite Firestore and break "file selected only" flow
            const { playerPhotoUrl: _pp, ...valuesRest } = values;
            const payload: any = {
                ...valuesRest,
                ...(storedPhotoUrl ? { playerPhotoUrl: storedPhotoUrl } : {}),
                agreementSignature,
                waiverSignature,
                ...(isWaitlistMode
                    ? { isDraft: false, paymentStatus: "waitlisted_no_payment" }
                    : { isDraft: true, paymentStatus: "pending_payment" }),
                registeredAt: new Date().toISOString(),
                ...(editId ? { registrationId: editId } : {}),
            };

            const res = await fetch(`/api/events/${eventId}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save registration.");
            }
            
            const responseData = await res.json();
            const regId = responseData.id || editId;

            // Step 2 — Upload player photo to Firebase Storage and write URL to registration
            const fileToUpload = photoFileRef.current ?? photoFile;
            if (fileToUpload) {
                try {
                    const extFromName = fileToUpload.name.includes(".")
                        ? fileToUpload.name.split(".").pop()
                        : undefined;
                    const ext =
                        (extFromName && extFromName.length <= 6 && extFromName.toLowerCase()) ||
                        (fileToUpload.type.includes("/") ? fileToUpload.type.split("/")[1] : "jpg");

                    const path = `registration-photos/${eventId}/${regId}.${ext}`;
                    const fileRef = storageRef(storage, path);
                    const contentType =
                        fileToUpload.type ||
                        (ext === "pdf"
                            ? "application/pdf"
                            : ext === "heic" || ext === "heif"
                              ? "image/heic"
                              : "application/octet-stream");
                    await uploadBytes(fileRef, fileToUpload, { contentType });
                    const url = await getDownloadURL(fileRef);

                    // Save URL to Firestore doc
                    await fetch(`/api/events/${eventId}/register`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ registrationId: regId, playerPhotoUrl: url }),
                    });
                } catch (err) {
                    console.error("Photo upload failed", err);
                    setPhotoError(`Photo upload failed. Please try again (max ${PLAYER_PHOTO_MAX_MB}MB).`);
                    setIsSubmitting(false);
                    document.getElementById("player-photo")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    return;
                }
            }

            if (isWaitlistMode) {
                setWaitlistRegistrationId(String(regId ?? ""));
                setWaitlistSubmitted(true);
                setIsSubmitting(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }

            // Step 3 — Create Stripe checkout session directly (no cart)
            const siteOrigin =
                process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
            const cancelUrl = `${siteOrigin}/checkout/resume?eventId=${eventId}&registrationId=${regId}`;

            const checkoutItems: any[] = [
                {
                id: `reg_${regId}`,
                type: "registration",
                    title: eventTitle || "Volleyball Tournament Registration",
                    amount: registrationFee ?? 0,
                    metadata: { eventId, registrationId: regId },
                },
            ];

            const checkoutRes = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: checkoutItems,
                    cancelUrl,
                    customerEmail: values.email,
                }),
            });

            if (!checkoutRes.ok) {
                const errorData = await checkoutRes.json();
                throw new Error(errorData.error || "Failed to create payment session.");
            }

            const { url } = await checkoutRes.json();
            if (!url) throw new Error("No checkout URL returned.");

            // Step 3 — Redirect to Stripe (registration is confirmed by webhook on success)
            window.location.assign(url);
        } catch (error: any) {
            console.error(error);
            setFormError(error.message || "Something went wrong. Please try again.");
            window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            {waitlistSubmitted ? (
                <div className="max-w-2xl mx-auto">
                    <Card className="border-amber-500/30 bg-amber-500/10">
                        <CardHeader>
                            <CardTitle>Waitlist submitted</CardTitle>
                            <CardDescription>
                                You’re on the waitlist. No payment is required right now.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-muted-foreground">
                            <p>We’ll reach out if a spot opens up.</p>
                            {waitlistRegistrationId && (
                                <p>
                                    <span className="font-semibold text-foreground">Confirmation ID:</span>{" "}
                                    {waitlistRegistrationId}
                                </p>
                            )}
                            <div className="pt-2">
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setWaitlistSubmitted(false);
                                        setWaitlistRegistrationId(null);
                                        form.reset();
                                    }}
                                >
                                    Submit another response
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void form.handleSubmit(onSubmit, (errors) => {
                        scrollToFirstRegistrationError(errors, (name) => form.setFocus(name as any));
                    })(e);
                }}
                className="space-y-12 max-w-4xl mx-auto"
            >
                <div className="text-center space-y-4 mb-12">
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                        {editId ? "Edit Registration" : "Registration"}
                    </h1>
                    <h2 className="text-2xl text-muted-foreground">BSC Men&apos;s Volleyball Tournament Season 9</h2>
                    {isRegistrationsClosed ? (
                        <div className="mx-auto max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            Registrations are closed for this event.
                        </div>
                    ) : isAfterRegistrationEnd ? (
                        <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                            Registration has ended — you can still submit to join the waitlist. No payment required.
                        </div>
                    ) : null}
                    {isLoadingEdit ? (
                        <p className="text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading your saved details…
                        </p>
                    ) : (
                        <p>{editId ? "Update your details below and re-submit." : "Hi there, please fill out and submit this form."}</p>
                    )}
                </div>


                {/* Team Ownership */}
                <Card id="reg-card-team-ownership" className="border-2 border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Team Ownership
                        </CardTitle>
                        <CardDescription>
                            A unique way to lead your team and gain visibility for your brand.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        <div className="space-y-3 text-muted-foreground leading-relaxed">
                            <p><span className="font-semibold text-foreground">Team Ownership Cost:</span> $1,253</p>
                            <p><span className="font-semibold text-foreground">Champion Team Owner Prize:</span> $2,786</p>
                            <p><span className="font-semibold text-foreground">Runner-Up Team Owner Prize:</span> $1,786</p>
                            <p className="pt-1">
                                Team Ownership offers a unique opportunity to be more involved in your team through
                                captain selection, team building, jerseys, and more, with the potential to help shape
                                a core for future tournaments.
                            </p>
                            <p>
                                Enjoy exclusive brand visibility through logo placement on team jerseys, team social
                                media content, and event banners.
                            </p>
                            <p className="text-xs italic">
                                Note: Rules for scenarios where a player is also a Team Owner but not a captain are
                                still being finalized.
                            </p>
                        </div>
                        <FormField
                            control={form.control}
                            name="interestedInTeamOwnership"
                            render={({ field }) => (
                                <FormItem className="flex items-start gap-3 rounded-lg border bg-background p-4">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel className="text-sm font-medium cursor-pointer">
                                            Check here if you&apos;re interested in Team Ownership
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <Card id="reg-card-personal">
                    <CardHeader>
                        <CardTitle>Personal Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="title" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Bhai">Bhai</SelectItem>
                                            <SelectItem value="Mulla">Mulla</SelectItem>
                                            <SelectItem value="Shaikh">Shaikh</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="firstName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>First Name*</FormLabel>
                                    <FormControl><Input placeholder="Hassan" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="lastName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Last Name*</FormLabel>
                                    <FormControl><Input placeholder="Ali" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="its" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ITS Number*</FormLabel>
                                    <FormControl><Input type="text" maxLength={8} placeholder="12345678" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="jamaatAffiliation" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Jamaat Affiliation*</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder="Select your jamaat" /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Anjuman-e-Burhani, Seattle">Anjuman-e-Burhani, Seattle</SelectItem>
                                            <SelectItem value="Anjuman-e-Badri, New York">Anjuman-e-Badri, New York</SelectItem>
                                            <SelectItem value="Anjuman-e-Badri, Ottawa">Anjuman-e-Badri, Ottawa</SelectItem>
                                            <SelectItem value="Anjuman-e-Burhanee, Los Angeles">Anjuman-e-Burhanee, Los Angeles</SelectItem>
                                            <SelectItem value="Anjuman-e-Burhani, Austin">Anjuman-e-Burhani, Austin</SelectItem>
                                            <SelectItem value="Anjuman-e-Burhani, New Jersey">Anjuman-e-Burhani, New Jersey</SelectItem>
                                            <SelectItem value="Anjuman-e-Burhani, Toronto">Anjuman-e-Burhani, Toronto</SelectItem>
                                            <SelectItem value="Anjuman-e-Ezzi, Boston">Anjuman-e-Ezzi, Boston</SelectItem>
                                            <SelectItem value="Anjuman-e-Ezzi, Washington D.C.">Anjuman-e-Ezzi, Washington D.C.</SelectItem>
                                            <SelectItem value="Anjuman-e-Fakhri, Minneapolis">Anjuman-e-Fakhri, Minneapolis</SelectItem>
                                            <SelectItem value="Anjuman-e-Fakhri, Missisauga">Anjuman-e-Fakhri, Missisauga</SelectItem>
                                            <SelectItem value="Anjuman-e-Fakhri, Philadelphia">Anjuman-e-Fakhri, Philadelphia</SelectItem>
                                            <SelectItem value="Anjuman-e-Fakhri, South Jersey">Anjuman-e-Fakhri, South Jersey</SelectItem>
                                            <SelectItem value="Anjuman-e-Hakimi, Bakersfield">Anjuman-e-Hakimi, Bakersfield</SelectItem>
                                            <SelectItem value="Anjuman-e-Hakimi, Montreal">Anjuman-e-Hakimi, Montreal</SelectItem>
                                            <SelectItem value="Anjuman-e-Hasani, Poconos">Anjuman-e-Hasani, Poconos</SelectItem>
                                            <SelectItem value="Anjuman-e-Husaini, Portland">Anjuman-e-Husaini, Portland</SelectItem>
                                            <SelectItem value="Anjuman-e-Husami, Atlanta">Anjuman-e-Husami, Atlanta</SelectItem>
                                            <SelectItem value="Anjuman-e-Husami, South Carolina">Anjuman-e-Husami, South Carolina</SelectItem>
                                            <SelectItem value="Anjuman-e-Imadi, Sugarland">Anjuman-e-Imadi, Sugarland</SelectItem>
                                            <SelectItem value="Anjuman-e-Jamali, Miami">Anjuman-e-Jamali, Miami</SelectItem>
                                            <SelectItem value="Anjuman-e-Jamali, North Carolina">Anjuman-e-Jamali, North Carolina</SelectItem>
                                            <SelectItem value="Anjuman-e-Jamali, San Jose">Anjuman-e-Jamali, San Jose</SelectItem>
                                            <SelectItem value="Anjuman-e-Jamali, Vancouver">Anjuman-e-Jamali, Vancouver</SelectItem>
                                            <SelectItem value="Anjuman-e-Mohammedi, San Antonio">Anjuman-e-Mohammedi, San Antonio</SelectItem>
                                            <SelectItem value="Anjuman-e-Mohammedi, San Diego">Anjuman-e-Mohammedi, San Diego</SelectItem>
                                            <SelectItem value="Anjuman-e-Mohammedi, Virginia">Anjuman-e-Mohammedi, Virginia</SelectItem>
                                            <SelectItem value="Anjuman-e-Najmi, Dallas">Anjuman-e-Najmi, Dallas</SelectItem>
                                            <SelectItem value="Anjuman-e-Najmi, Detroit">Anjuman-e-Najmi, Detroit</SelectItem>
                                            <SelectItem value="Anjuman-e-Najmi, San Francisco">Anjuman-e-Najmi, San Francisco</SelectItem>
                                            <SelectItem value="Anjuman-e-Qutbi, Orange County">Anjuman-e-Qutbi, Orange County</SelectItem>
                                            <SelectItem value="Anjuman-e-Saifee, Chicago">Anjuman-e-Saifee, Chicago</SelectItem>
                                            <SelectItem value="Anjuman-e-Saifee, Edmonton">Anjuman-e-Saifee, Edmonton</SelectItem>
                                            <SelectItem value="Anjuman-e-Saifee, Woodlands">Anjuman-e-Saifee, Woodlands</SelectItem>
                                            <SelectItem value="Anjuman-e-Shujaee, Houston">Anjuman-e-Shujaee, Houston</SelectItem>
                                            <SelectItem value="Anjuman-e-Shujahee, North Chicago">Anjuman-e-Shujahee, North Chicago</SelectItem>
                                            <SelectItem value="Anjuman-e-Taheri, Columbus">Anjuman-e-Taheri, Columbus</SelectItem>
                                            <SelectItem value="Anjuman-e-Taheri, Plano">Anjuman-e-Taheri, Plano</SelectItem>
                                            <SelectItem value="Anjuman-e-Vajihi, Calgary">Anjuman-e-Vajihi, Calgary</SelectItem>
                                            <SelectItem value="Anjuman-e-Vajihi, Tampa">Anjuman-e-Vajihi, Tampa</SelectItem>
                                            <SelectItem value="Non-US/Canada jamaat">Non-US/Canada jamaat</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email*</FormLabel>
                                    <FormControl><Input type="email" placeholder="example@example.com" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="whatsappNumber" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>WhatsApp Number*</FormLabel>
                                    <FormControl><Input placeholder="(###) ###-####" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="studentStatus" render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>Student (Optional)</FormLabel><FormDescription>If enrolled, which School/University?</FormDescription><FormControl><Input placeholder="e.g. University of Houston" {...field} /></FormControl></FormItem>
                            )} />
                        </div>
                    </CardContent>
                </Card>

                {/* Player Photo Upload */}
                <Card id="player-photo" className={photoError ? "ring-2 ring-destructive" : ""}>
                    <CardHeader>
                        <CardTitle>Player Photo*</CardTitle>
                        <CardDescription>
                            Upload a clear headshot (max {PLAYER_PHOTO_MAX_MB}MB).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-4 items-start">
                            <div className="flex-1 space-y-2">
                                <Label>Upload Photo*</Label>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        ref={photoInputRef}
                                        id="playerPhoto"
                                        type="file"
                                        accept="image/*,.pdf,.heic,.heif"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] ?? null;
                                            setPhotoError(null);
                                            if (photoPreview && photoPreviewIsObjectUrl) URL.revokeObjectURL(photoPreview);
                                            if (f && isPhotoTooLarge(f)) {
                                                setPhotoFile(null);
                                                photoFileRef.current = null;
                                                setPhotoPreview(null);
                                                setPhotoPreviewIsObjectUrl(false);
                                                setPhotoError(`Photo is too large. Max ${PLAYER_PHOTO_MAX_MB}MB.`);
                                                e.target.value = "";
                                                return;
                                            }
                                            setPhotoFile(f);
                                            photoFileRef.current = f;
                                            if (f) {
                                                if (canPreviewAsImage(f)) {
                                                    const url = URL.createObjectURL(f);
                                                    setPhotoPreview(url);
                                                    setPhotoPreviewIsObjectUrl(true);
                                                } else {
                                                    setPhotoPreview(null);
                                                    setPhotoPreviewIsObjectUrl(false);
                                                }
                                                form.setValue("playerPhotoUrl", "", { shouldDirty: true });
                                            } else {
                                                setPhotoPreview(null);
                                                setPhotoPreviewIsObjectUrl(false);
                                                photoFileRef.current = null;
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="gap-2"
                                        onClick={() => photoInputRef.current?.click()}
                                    >
                                        <Upload className="h-4 w-4" />
                                        Choose Photo
                                    </Button>

                                    {(photoPreview || photoFile) && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="gap-2 text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                                setPhotoError(null);
                                                setPhotoFile(null);
                                                photoFileRef.current = null;
                                                if (photoPreview && photoPreviewIsObjectUrl) URL.revokeObjectURL(photoPreview);
                                                setPhotoPreview(null);
                                                setPhotoPreviewIsObjectUrl(false);
                                                form.setValue("playerPhotoUrl", "", { shouldDirty: true });
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                            Remove
                                        </Button>
                                    )}
                                </div>
                                {photoError && (
                                    <p className="text-sm text-destructive flex items-center gap-1.5">
                                        <AlertCircle className="h-4 w-4" /> {photoError}
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Supports jpeg, png, heic, pdf, and other common file types (max {PLAYER_PHOTO_MAX_MB}MB).
                                </p>
                                {photoFile && !canPreviewAsImage(photoFile) && (
                                    <p className="text-xs text-muted-foreground">
                                        Selected file: {photoFile.name}
                                    </p>
                                )}
                            </div>
                            <div className="w-full md:w-48">
                                    <div className="aspect-square rounded-xl overflow-hidden border bg-muted flex items-center justify-center">
                                    {photoPreview ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={photoPreview} alt="Player photo preview" className="h-full w-full object-cover" />
                                    ) : photoFile ? (
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 text-center">
                                            <Upload className="h-8 w-8 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground break-all line-clamp-4">{photoFile.name}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">No file selected</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card id="reg-card-physical">
                    <CardHeader>
                        <CardTitle>Physical Stats & Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                            <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>Date of Birth*</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="bday"
                                            placeholder="MM/DD/YYYY"
                                            maxLength={10}
                                            value={field.value}
                                            onChange={(e) => field.onChange(formatDobInput(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormDescription>Format: MM/DD/YYYY</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="heightFeet" render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>Height (Feet)*</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                    </FormControl>
                                    {/* Reserve one line so inputs align with DOB row (has helper text below) */}
                                    <p className="text-sm text-transparent select-none pointer-events-none" aria-hidden>
                                        &nbsp;
                                    </p>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="heightInches" render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>Height (Inches)*</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                    </FormControl>
                                    <p className="text-sm text-transparent select-none pointer-events-none" aria-hidden>
                                        &nbsp;
                                    </p>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="weight" render={({ field }) => (
                                <FormItem className="w-full">
                                    <FormLabel>Weight (lbs)*</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                    </FormControl>
                                    <p className="text-sm text-transparent select-none pointer-events-none" aria-hidden>
                                        &nbsp;
                                    </p>
                                </FormItem>
                            )} />
                        </div>
                        <FormField control={form.control} name="tshirtSize" render={({ field }) => (
                            <FormItem className="md:w-1/2">
                                <FormLabel>T-Shirt Size*</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {["S", "M", "L", "XL", "XXL", "XXXL"].map((sz) => <SelectItem key={sz} value={sz}>{sz}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="instagramHandle" render={({ field }) => (
                            <FormItem><FormLabel>Instagram Handle (Optional)</FormLabel><FormControl><Input placeholder="@handle" {...field} /></FormControl></FormItem>
                        )} />
                    </CardContent>
                </Card>

                <Card id="reg-card-experience">
                    <CardHeader>
                        <CardTitle>Player Experience & Skills</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <FormField control={form.control} name="isCaptain" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Captain?*</FormLabel>
                                <FormDescription>Captains draft their own team, requiring a BIG time commitment and leadership.</FormDescription>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger className="w-[200px]"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="YES">YES</SelectItem>
                                        <SelectItem value="NO">NO</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="playFrequency" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">How often do you currently play Volleyball?*</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Regularly">Regularly (Once a week or more)</SelectItem>
                                        <SelectItem value="Often">Often (1-2 times a month)</SelectItem>
                                        <SelectItem value="Rarely">Rarely</SelectItem>
                                        <SelectItem value="Never">Never</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="strongestPosition" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Strongest Position*</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Outside Hitter">Outside Hitter (Spiker, Front Line)</SelectItem>
                                        <SelectItem value="Setter">Setter (Middle Front)</SelectItem>
                                        <SelectItem value="Libero">Libero (Middle Back)</SelectItem>
                                        <SelectItem value="Defensive Specialist">Defensive Specialist (Back line)</SelectItem>
                                        <SelectItem value="Serving Specialist">Serving Specialist (Service)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )} />

                        <div id="reg-anchor-skills" className="space-y-4 scroll-mt-24">
                            <FormLabel className="text-base">Rank your skills (1-10)*</FormLabel>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                {['digging', 'passing', 'setting', 'spiking', 'blocking', 'serving'].map((skill) => (
                                    <FormField key={skill} control={form.control} name={`skills.${skill}` as any} render={({ field }) => (
                                        <FormItem className="flex items-center gap-4">
                                            <FormLabel className="w-24 capitalize mb-0">{skill}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min={1}
                                                    max={10}
                                                    value={(field.value ?? "") as any}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        if (v === "") {
                                                            field.onChange(undefined);
                                                            return;
                                                        }
                                                        const n = Number.parseInt(v, 10);
                                                        if (Number.isNaN(n)) return;
                                                        field.onChange(n);
                                                    }}
                                                    onBlur={(e) => {
                                                        field.onBlur();
                                                        const raw = e.target.value.trim();
                                                        const path = `skills.${skill}` as const;
                                                        form.clearErrors(path as any);
                                                        if (raw === "") {
                                                            field.onChange(undefined);
                                                            return;
                                                        }
                                                        const n = Number.parseInt(raw, 10);
                                                        if (Number.isNaN(n)) {
                                                            field.onChange(undefined);
                                                            form.setError(path as any, {
                                                                type: "manual",
                                                                message: "Enter a whole number from 1 to 10",
                                                            });
                                                            return;
                                                        }
                                                        const clamped = Math.min(10, Math.max(1, n));
                                                        field.onChange(clamped);
                                                    }}
                                                    className="w-[100px]"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                ))}
                            </div>
                        </div>

                        <FormField control={form.control} name="injuries" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Any injuries or health concerns?*</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="draftPitch" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Let the Captains know why they should draft you</FormLabel>
                                <FormDescription>
                                    Optional. If you add a message, minimum {DRAFT_PITCH_MIN_WORDS} words.
                                </FormDescription>
                                <FormControl><Textarea className="min-h-[100px]" {...field} value={field.value ?? ""} /></FormControl>
                                <p className="text-xs text-muted-foreground">
                                    Word count: {(field.value ?? "").trim().split(/\s+/).filter(Boolean).filter(Boolean).length}
                                </p>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </CardContent>
                </Card>

                <Card id="reg-card-emergency">
                    <CardHeader>
                        <CardTitle>Emergency Contact</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="iceFirstName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ICE First Name*</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="iceLastName" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ICE Last Name*</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="icePhone" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ICE Phone Number*</FormLabel>
                                    <FormControl><Input placeholder="(###) ###-####" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="foodAllergies" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Food Allergies*</FormLabel>
                                    <FormControl><Input placeholder="None" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    </CardContent>
                </Card>

                {/* SIGNATURE 1 */}
                <Card id="sig-agreement" className={sigError === "agreement" ? "ring-2 ring-destructive" : ""}>
                    <CardHeader>
                        <CardTitle className="text-destructive">Tournament Participation Agreement*</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-sm">
                        <div className="max-h-64 overflow-y-auto p-4 border rounded-md whitespace-pre-wrap leading-relaxed text-muted-foreground bg-muted/30">
{`Tournament Participation Agreement
By registering for this tournament, participants agree to adhere to the following terms:

1. Upholding Values
Participants are expected to uphold the integrity and spirit of the tournament at all times, promoting fair play and respect among all competitors.

2. Draft Rules
Teams will be assembled through a snake draft process. Players must provide accurate and honest information to maintain the integrity of the auction.
Once drafted, you are committed to playing for the captain who selected you. If you are unable to continue participation in the tournament due to injury or other reasons, you cannot play for any other team. Additionally, no player are permitted to re-enter the tournament for their original team or any other team.

3. Refund Policy
Once registered, participants may elect to drop out prior to the draft for a full refund minus processing fees.

This is a draft and you are not guaranteed to be selected. Players who are not selected will be refunded in full and placed in a reserve pool. Captains needing to replace a player may select a replacement from this pool, subject to the tournament's replacement policies.

If drafted, participants who withdraw from the tournament may be eligible for a partial refund. The refund amount will depend on processing fees, any other expenses already incurred on the participant's behalf, and whether a suitable replacement is found. All refunds will be at the organizers' discretion.

4. Player Replacement Policy:
Players who are replaced by another player are not eligible to participate further in the tournament.
Replacements must be of equal or lower tier compared to the original player. All replacement decisions require approval from the Tournament Committee.
Temporary fill-ins are not permitted; any player introduced as a replacement is considered final for the remainder of the tournament.
Replacements are required to pay the full participation fee as stipulated for the tournament.
No replacements will be permitted after the commencement of the tournament.

5. Uniform Rules
Players must adhere to all uniform regulations set forth by the tournament organizers.

6. Consent for Communication and Media Use
Participants consent to be added to our tournament mailing list for receiving updates, news, and future event information. This consent includes receiving communication via email and other forms deemed appropriate by the tournament organizers.
Participants grant the tournament organizers the right to capture, use, publish, and distribute photographs, video, and other forms of media that may include their likeness. These materials may be used for promotional purposes, including but not limited to social media posts, marketing materials, and public relations initiatives.
Participants may opt out of the mailing list at any time by following the unsubscribe instructions provided in each email or by contacting the tournament organizers directly.
Participants wishing to restrict the use of their images or media for promotional purposes must submit a written request to the tournament organizers prior to the commencement of the tournament.

By agreeing to these terms, you commit to the integrity and smooth operation of the tournament. Thank you for your cooperation!`}
                        </div>
                        <div className={`border-2 border-dashed bg-background rounded-md mt-6 relative touch-none ${sigError === "agreement" ? "border-destructive" : "border-primary/20"}`} style={{height: 200}}>
                            <SignatureCanvas 
                                key={`sig-agreement-${resolvedTheme ?? "light"}`}
                                ref={sigPadAgreement} 
                                penColor={sigPenColor}
                                canvasProps={{
                                    className: "w-full h-full absolute inset-0 cursor-crosshair rounded-md",
                                    style: { backgroundColor: sigCanvasBg },
                                }}
                                onEnd={() => { setSigError(null); form.trigger("participationAgreementSignature"); }}
                            />
                            <Button type="button" variant="outline" size="sm" className="absolute top-2 right-2 text-xs h-7" onClick={() => sigPadAgreement.current?.clear()}>Clear</Button>
                        </div>
                        {sigError === "agreement" && (
                            <p className="text-sm text-destructive flex items-center gap-1.5 mt-1">
                                <AlertCircle className="h-4 w-4" /> Please sign the Tournament Participation Agreement to proceed.
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground text-center">Please sign your name inside the box above to accept the terms.</p>
                    </CardContent>
                </Card>

                {/* SIGNATURE 2 */}
                <Card id="sig-waiver" className={sigError === "waiver" ? "ring-2 ring-destructive" : ""}>
                    <CardHeader>
                        <CardTitle className="text-destructive">Release and Waiver of Liability*</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 text-sm">
                        <div className="max-h-64 overflow-y-auto p-4 border rounded-md whitespace-pre-wrap leading-relaxed text-muted-foreground bg-muted/30">
{`RELEASE AND WAIVER OF LIABILITY AND ASSUMPTION OF RISK

The individual named below (referred to as "I" or "me") desires to participate in various sport activities and/or physical training programs (whether singular or plural, hereinafter referred to as the "Activities") provided by Burhani Sports Club, a division of Dawat-e-Hadiyah, Texas, a Texas non-profit corporation with offices located at 17910 Coventry Park Dr., Houston, Texas 77084 (the "Company"). In consideration of being permitted by the Company to participate in the Activities and in recognition of the Company's reliance hereon, I agree to all the terms and conditions set forth in this instrument (this "Release").

1. I AM AWARE AND UNDERSTAND THAT THE ACTIVITIES ARE POTENTIALLY DANGEROUS ACTIVITIES AND INVOLVE THE RISK OF SERIOUS INJURY, DISABILITY, DEATH, AND/OR PROPERTY DAMAGE. I ACKNOWLEDGE THAT ANY INJURIES THAT I SUSTAIN MAY RESULT FROM OR BE COMPOUNDED BY THE ACTIONS, OMISSIONS, OR NEGLIGENCE OF THE COMPANY, INCLUDING NEGLIGENT EMERGENCY RESPONSE OR RESCUE OPERATIONS OF THE COMPANY. NOTWITHSTANDING THE RISK, I ACKNOWLEDGE THAT I AM VOLUNTARILY PARTICIPATING IN THE ACTIVITIES WITH KNOWLEDGE AND AN EXPRESS UNDERSTANDING OF THE DANGER INVOLVED AND HEREBY AGREE TO ACCEPT AND ASSUME ANY AND ALL RISKS OF INJURY, DISABILITY, DEATH, AND/OR PROPERTY DAMAGE ARISING FROM MY PARTICIPATION IN THE ACTIVITIES, WHETHER CAUSED BY THE ORDINARY NEGLIGENCE OF THE COMPANY OR OTHERWISE.

2. I HEREBY EXPRESSLY WAIVE AND RELEASE ANY AND ALL CLAIMS, NOW KNOWN OR HEREAFTER KNOWN, AGAINST THE COMPANY, AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AFFILIATES, SUCCESSORS, AND ASSIGNS (COLLECTIVELY, "RELEASEES"), ON ACCOUNT OF INJURY, DISABILITY, DEATH, OR PROPERTY DAMAGE ARISING OUT OF OR ATTRIBUTABLE TO MY PARTICIPATION IN THE ACTIVITIES, WHETHER ARISING OUT OF THE ORDINARY NEGLIGENCE OF THE RELEASEES OR OTHERWISE. I COVENANT NOT TO MAKE OR BRING ANY SUCH CLAIM AGAINST THE COMPANY OR ANY OTHER RELEASEE, AND FOREVER RELEASE AND DISCHARGE THE COMPANY AND ALL OTHER RELEASEES FROM LIABILITY UNDER SUCH CLAIMS.

3. I SHALL DEFEND, INDEMNIFY, AND HOLD HARMLESS THE COMPANY AND ANY OTHER RELEASEES AGAINST ANY AND ALL LOSSES, DAMAGES, LIABILITIES, DEFICIENCIES, CLAIMS, ACTIONS, JUDGMENTS, SETTLEMENTS, AWARDS, PENALTIES, FINES, COSTS, OR EXPENSES OF WHATEVER KIND, INCLUDING REASONABLE ATTORNEY FEES, FEES, THE COSTS OF ENFORCING ANY RIGHT TO INDEMNIFICATION UNDER THIS RELEASE, AND THE COST OF PURSUING ANY INSURANCE PROVIDERS, INCURRED BY/AWARDED AGAINST THE RELEASEES ARISING OUT OF OR RESULTING FROM ANY CLAIM OF A THIRD PARTY RELATED TO MY PARTICIPATION IN THE ACTIVITIES, INCLUDING ANY CLAIM RELATED TO MY OWN NEGLIGENCE OR THE ORDINARY NEGLIGENCE OF THE COMPANY,

4. I hereby consent to receive medical treatment deemed necessary if I am injured or require medical attention during my participation in the Activities. I understand and agree that I am solely responsible for all costs related to such medical treatment and any related medical transportation. I hereby release, forever discharge, and hold harmless the Company from any claim based on such treatment or other medical services.

5. This Release constitutes the sole and entire agreement of the Company and me with respect to the subject matter contained herein and supersedes all prior and contemporaneous understandings, agreements, representations, and warranties, both written and oral, with respect to such subject matter. If any term or provision of this Release or the application thereof to any party or circumstance is held invalid, illegal, or unenforceable to any extent in any jurisdiction, then the remaining terms and provisions of this Release and their application to other parties or circumstances shall not be affected thereby and shall be enforced to the greatest extent permitted by law. This Release is binding on and shall inure to the benefit of the Company and me and their respective successors and assigns. All matters arising out of or relating to this Release shall be governed by and construed in accordance with the internal laws of the State of Texas, excluding any conflict-of-laws rule or principle that might refer the governance or the construction of this agreement to the laws of another jurisdiction. Any claim or cause of action arising under this Release may be brought only in the federal and state courts located in Harris County, Texas and I hereby consent to the exclusive jurisdiction of such courts.`}
                        </div>
                        <div className={`border-2 border-dashed bg-background rounded-md mt-6 relative touch-none ${sigError === "waiver" ? "border-destructive" : "border-primary/20"}`} style={{height: 200}}>
                            <SignatureCanvas 
                                key={`sig-waiver-${resolvedTheme ?? "light"}`}
                                ref={sigPadWaiver} 
                                penColor={sigPenColor}
                                canvasProps={{
                                    className: "w-full h-full absolute inset-0 cursor-crosshair rounded-md",
                                    style: { backgroundColor: sigCanvasBg },
                                }}
                                onEnd={() => { setSigError(null); form.trigger("waiverSignature"); }}
                            />
                            <Button type="button" variant="outline" size="sm" className="absolute top-2 right-2 text-xs h-7" onClick={() => sigPadWaiver.current?.clear()}>Clear</Button>
                        </div>
                        {sigError === "waiver" && (
                            <p className="text-sm text-destructive flex items-center gap-1.5 mt-1">
                                <AlertCircle className="h-4 w-4" /> Please sign the Release and Waiver of Liability to proceed.
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground text-center">Please sign your name inside the box above to accept the waiver.</p>
                    </CardContent>
                </Card>

                {/* Sticky submit bar — compact single row */}
                {(() => {
                    const totalAmount = registrationFee ?? null; // null until server prop arrives
                    const isLoadingAmount = totalAmount === null;

                    return (
                        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur border-t px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
                            <AnimatePresence>
                                {formError && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5 mb-2"
                                    >
                                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        <span>{formError}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex items-center justify-between gap-3 w-full">
                                {!isWaitlistMode ? (
                                    <div className="shrink-0 min-w-[96px]">
                                        <p className="text-[10px] text-muted-foreground leading-none">Total</p>
                                        <p className="text-lg font-bold leading-tight tabular-nums">
                                            {isLoadingAmount ? "—" : `$${totalAmount!.toFixed(2)}`}
                                        </p>
                                    </div>
                                ) : (
                                    <div />
                                )}

                                {/* Submit */}
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="h-10 min-w-[120px] px-5 font-semibold text-sm"
                                    disabled={isSubmitting || isRegistrationsClosed}
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : editId ? (
                                        "Update →"
                                    ) : isAfterRegistrationEnd ? (
                                        "Submit →"
                                    ) : (
                                        "Pay →"
                                    )}
                    </Button>
                </div>
                        </div>
                    );
                })()}
            </form>
            )}
        </Form>
    );
}
