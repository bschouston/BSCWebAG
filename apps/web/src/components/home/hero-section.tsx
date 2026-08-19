"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HomepageLightboxItem } from "@/types";

const FAN = [
  { rotate: "-14deg", x: "-34%", y: "6%", z: 10, scale: 0.86 },
  { rotate: "-6deg", x: "-16%", y: "2%", z: 20, scale: 0.92 },
  { rotate: "3deg", x: "6%", y: "-2%", z: 40, scale: 1 },
  { rotate: "12deg", x: "26%", y: "5%", z: 25, scale: 0.9 },
  { rotate: "18deg", x: "42%", y: "12%", z: 8, scale: 0.82 },
];

export function HeroSection() {
  const [flyers, setFlyers] = useState<string[]>([]);
  const [front, setFront] = useState(0);

  useEffect(() => {
    fetch("/api/homepage/lightbox")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const urls = ((data.items ?? []) as HomepageLightboxItem[])
          .map((item) => item.imageUrl)
          .filter((url): url is string => Boolean(url));
        setFlyers(urls);
        setFront(0);
      })
      .catch(() => setFlyers([]));
  }, []);

  useEffect(() => {
    if (flyers.length < 2) return;
    const id = window.setInterval(() => {
      setFront((n) => (n + 1) % flyers.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, [flyers.length]);

  const visible =
    flyers.length > 0 ? FAN.map((_, i) => flyers[(front + i) % flyers.length]) : [];

  return (
    <section className="relative z-10 text-[#1a3556] dark:text-white">
      <div className="container mx-auto grid grid-cols-1 items-center gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-8">
        <div className="flex items-stretch gap-4 sm:gap-6">
          <div className="relative w-24 shrink-0 sm:w-36 lg:w-44">
            <Image
              src="/images/bsclogo.png"
              alt="Burhani Sports Club"
              fill
              sizes="176px"
              priority
              className="object-contain object-center drop-shadow-[0_8px_18px_rgba(0,0,0,0.18)] dark:drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
            />
          </div>
          <div className="min-w-0 max-w-xl">
            <p className="mb-4 inline-flex items-center rounded-full border border-[#FFD700]/70 bg-[#1a3556]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#1a3556] backdrop-blur-md dark:border-[#FFD700]/50 dark:bg-white/10 dark:text-[#FFD700]">
              Houston · Community · Competition
            </p>
            <h1 className="text-3xl font-black leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Burhani
              <span className="block text-[#c8102e] dark:text-[#FFD700]">Sports Club</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-[#1a3556]/70 sm:text-base dark:text-white/75">
              Soccer, cricket, throwball, swim, and weekly fitness — one club, a full calendar of energy.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="lg" className="h-11 rounded-full px-6 text-base font-semibold" asChild>
                <Link href="/events">
                  View events <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-full border-[#1a3556]/30 px-6 text-base text-[#1a3556] hover:bg-[#1a3556] hover:text-white dark:border-[#FFD700]/60 dark:bg-transparent dark:text-[#FFD700] dark:hover:bg-[#FFD700] dark:hover:text-[#1a3556]"
                asChild
              >
                <Link href="/about">About the club</Link>
              </Button>
            </div>
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="relative mx-auto h-[280px] w-full max-w-[520px] sm:h-[320px] lg:h-[360px]">
            {visible.map((src, i) => {
              const pose = FAN[i];
              const isFront = i === 2;
              return (
                <div
                  key={`${src}-${i}`}
                  className="absolute left-1/2 top-1/2 aspect-[3/4] w-[42%] overflow-hidden rounded-2xl border-2 border-[#FFD700]/70 shadow-[0_20px_50px_rgba(26,53,86,0.18)] transition-[transform,opacity] duration-700 ease-out dark:border-[#FFD700]/50 dark:shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
                  style={{
                    transform: `translate(-50%, -50%) translate(${pose.x}, ${pose.y}) rotate(${pose.rotate}) scale(${pose.scale})`,
                    zIndex: pose.z,
                    opacity: isFront ? 1 : 0.88,
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    className={`h-full w-full object-cover ${isFront ? "scale-105" : ""}`}
                  />
                  {isFront ? (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10 dark:from-black/35" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
