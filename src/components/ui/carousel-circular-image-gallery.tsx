"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(MotionPathPlugin);

export interface ImageData {
    title: string;
    url: string;
}

export interface ImageGalleryProps {
    images: ImageData[];
    /** Defaults to 3000 ms */
    autoplayIntervalMs?: number;
    className?: string;
}

export function ImageGallery({
    images,
    autoplayIntervalMs = 3000,
    className,
}: ImageGalleryProps) {
    const [opened, setOpened] = useState(0);
    const [inPlace, setInPlace] = useState(0);
    const [disabled, setDisabled] = useState(false);
    const autoplayTimer = useRef<number | null>(null);

    const onClick = (index: number) => {
        if (!disabled) setOpened(index);
    };

    const onInPlace = (index: number) => setInPlace(index);

    const next = useCallback(() => {
        setOpened((currentOpened) => {
            let nextIndex = currentOpened + 1;
            if (nextIndex >= images.length) nextIndex = 0;
            return nextIndex;
        });
    }, [images.length]);

    const prev = useCallback(() => {
        setOpened((currentOpened) => {
            let prevIndex = currentOpened - 1;
            if (prevIndex < 0) prevIndex = images.length - 1;
            return prevIndex;
        });
    }, [images.length]);

    useEffect(() => setDisabled(true), [opened]);
    useEffect(() => setDisabled(false), [inPlace]);

    useEffect(() => {
        if (images.length <= 1) return;

        if (autoplayTimer.current) {
            clearInterval(autoplayTimer.current);
        }

        autoplayTimer.current = window.setInterval(next, autoplayIntervalMs);

        return () => {
            if (autoplayTimer.current) {
                clearInterval(autoplayTimer.current);
            }
        };
    }, [opened, images.length, next, autoplayIntervalMs]);

    if (!images.length) return null;

    return (
        <div
            className={cn(
                "relative w-full flex flex-col items-center justify-center py-2",
                className
            )}
        >
            <div className="relative h-[80vmin] w-[80vmin] max-h-[600px] max-w-[600px] overflow-hidden rounded-[20px] shadow-[0_2.8px_2.2px_rgba(0,0,0,0.02),0_6.7px_5.3px_rgba(0,0,0,0.028),0_12.5px_10px_rgba(0,0,0,0.035),0_22.3px_17.9px_rgba(0,0,0,0.042),0_41.8px_33.4px_rgba(0,0,0,0.05),0_100px_80px_rgba(0,0,0,0.07)]">
                {images.map((image, i) => (
                    <div
                        key={image.url}
                        className="absolute left-0 top-0 h-full w-full"
                        style={{ zIndex: inPlace === i ? i : images.length + 1 }}
                    >
                        <GalleryImage
                            total={images.length}
                            id={i}
                            url={image.url}
                            title={image.title}
                            open={opened === i}
                            inPlace={inPlace === i}
                            onInPlace={onInPlace}
                        />
                    </div>
                ))}
                <div className="absolute left-0 top-0 z-[100] h-full w-full pointer-events-none">
                    <Tabs images={images} onSelect={onClick} />
                </div>
            </div>

            {images.length > 1 && (
                <>
                    <button
                        type="button"
                        className="absolute left-[calc(50%-40vmin-40px)] sm:left-[calc(50%-300px-50px)] top-1/2 z-[101] flex h-14 w-14 sm:h-16 sm:w-16 -translate-y-1/2 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-border/60 bg-background/95 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.12)] outline-none transition-all duration-300 ease-out hover:scale-110 hover:bg-background hover:border-primary/40 hover:shadow-[0_12px_48px_rgba(0,0,0,0.18)] active:scale-95 focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                        onClick={prev}
                        disabled={disabled}
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="h-7 w-7 text-foreground" strokeWidth={2} />
                    </button>

                    <button
                        type="button"
                        className="absolute right-[calc(50%-40vmin-40px)] sm:right-[calc(50%-300px-50px)] top-1/2 z-[101] flex h-14 w-14 sm:h-16 sm:w-16 -translate-y-1/2 translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-border/60 bg-background/95 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.12)] outline-none transition-all duration-300 ease-out hover:scale-110 hover:bg-background hover:border-primary/40 hover:shadow-[0_12px_48px_rgba(0,0,0,0.18)] active:scale-95 focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                        onClick={next}
                        disabled={disabled}
                        aria-label="Next image"
                    >
                        <ChevronRight className="h-7 w-7 text-foreground" strokeWidth={2} />
                    </button>
                </>
            )}
        </div>
    );
}

interface GalleryImageProps {
    url: string;
    title: string;
    open: boolean;
    inPlace: boolean;
    id: number;
    onInPlace: (id: number) => void;
    total: number;
}

function GalleryImage({ url, title, open, inPlace, id, onInPlace, total }: GalleryImageProps) {
    const [firstLoad, setLoaded] = useState(true);
    const clip = useRef<SVGCircleElement>(null);

    const gap = 10;
    const circleRadius = 7;
    const defaults = { transformOrigin: "center center" };
    const duration = 0.4;
    const width = 400;
    const height = 400;
    const scale = 700;

    const bigSize = circleRadius * scale;
    const overlap = 0;

    const getPosSmall = () => ({
        cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap),
        cy: height - 30,
        r: circleRadius,
    });
    const getPosSmallAbove = () => ({
        cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap),
        cy: height / 2,
        r: circleRadius * 2,
    });
    const getPosCenter = () => ({ cx: width / 2, cy: height / 2, r: circleRadius * 7 });
    const getPosEnd = () => ({ cx: width / 2 - bigSize + overlap, cy: height / 2, r: bigSize });
    const getPosStart = () => ({ cx: width / 2 + bigSize - overlap, cy: height / 2, r: bigSize });

    useEffect(() => {
        setLoaded(false);
        if (clip.current) {
            const flipDuration = firstLoad ? 0 : duration;
            const upDuration = firstLoad ? 0 : 0.2;
            const bounceDuration = firstLoad ? 0.01 : 1;
            const delay = firstLoad ? 0 : flipDuration + upDuration;

            if (open) {
                gsap
                    .timeline()
                    .set(clip.current, { ...defaults, ...getPosSmall() })
                    .to(clip.current, {
                        ...defaults,
                        ...getPosCenter(),
                        duration: upDuration,
                        ease: "power3.inOut",
                    })
                    .to(clip.current, {
                        ...defaults,
                        ...getPosEnd(),
                        duration: flipDuration,
                        ease: "power4.in",
                        onComplete: () => onInPlace(id),
                    });
            } else {
                gsap
                    .timeline({ overwrite: true })
                    .set(clip.current, { ...defaults, ...getPosStart() })
                    .to(clip.current, {
                        ...defaults,
                        ...getPosCenter(),
                        delay: delay,
                        duration: flipDuration,
                        ease: "power4.out",
                    })
                    .to(clip.current, {
                        ...defaults,
                        motionPath: {
                            path: [getPosSmallAbove(), getPosSmall()],
                            curviness: 1,
                        },
                        duration: bounceDuration,
                        ease: "bounce.out",
                    });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full"
            role="img"
            aria-label={title}
        >
            <defs>
                <clipPath id={`${id}_circleClip`}>
                    <circle className="clip" cx="0" cy="0" r={circleRadius} ref={clip} />
                </clipPath>
                <clipPath id={`${id}_squareClip`}>
                    <rect className="clip" width={width} height={height} />
                </clipPath>
            </defs>
            <g clipPath={`url(#${id}${inPlace ? "_squareClip" : "_circleClip"})`}>
                <image width={width} height={height} href={url} className="pointer-events-none" />
            </g>
        </svg>
    );
}

interface TabsProps {
    images: ImageData[];
    onSelect: (index: number) => void;
}

function Tabs({ images, onSelect }: TabsProps) {
    const gap = 10;
    const circleRadius = 7;
    const width = 400;
    const height = 400;

    const getPosX = (i: number) =>
        width / 2 - (images.length * (circleRadius * 2 + gap) - gap) / 2 + i * (circleRadius * 2 + gap);
    const getPosY = () => height - 30;

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full"
        >
            {images.map((image, i) => (
                <g key={image.url} className="pointer-events-auto">
                    <defs>
                        <clipPath id={`tab_${i}_clip`}>
                            <circle cx={getPosX(i)} cy={getPosY()} r={circleRadius} />
                        </clipPath>
                    </defs>
                    <image
                        x={getPosX(i) - circleRadius}
                        y={getPosY() - circleRadius}
                        width={circleRadius * 2}
                        height={circleRadius * 2}
                        href={image.url}
                        clipPath={`url(#tab_${i}_clip)`}
                        className="pointer-events-none"
                        preserveAspectRatio="xMidYMid slice"
                    />
                    <circle
                        onClick={() => onSelect(i)}
                        className="cursor-pointer fill-white/0 stroke-primary/70 hover:stroke-primary transition-all"
                        strokeWidth="2"
                        cx={getPosX(i)}
                        cy={getPosY()}
                        r={circleRadius + 2}
                    />
                </g>
            ))}
        </svg>
    );
}
