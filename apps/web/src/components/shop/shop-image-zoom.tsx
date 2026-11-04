"use client";

import { useCallback, useState, type MouseEvent } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type ShopImageZoomProps = {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Extra scale on hover (1.5 = 150%). */
  zoom?: number;
};

/** Product photo with mouse-follow zoom on hover (desktop). */
export function ShopImageZoom({
  src,
  alt,
  className,
  priority,
  sizes = "(max-width:768px) 100vw, 50vw",
  zoom = 1.75,
}: ShopImageZoomProps) {
  const [origin, setOrigin] = useState("50% 50%");
  const [hovering, setHovering] = useState(false);

  const onMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`);
  }, []);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        setOrigin("50% 50%");
      }}
      onMouseMove={onMove}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        unoptimized
        className="object-contain transition-transform duration-200 ease-out will-change-transform"
        style={{
          transformOrigin: origin,
          transform: hovering ? `scale(${zoom})` : "scale(1)",
        }}
      />
    </div>
  );
}
