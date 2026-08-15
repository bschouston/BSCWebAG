"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import type { HomepageLightboxItem } from "@/types";

export function HistoricalHighlights() {
  const [items, setItems] = useState<HomepageLightboxItem[]>([]);
  const [selected, setSelected] = useState<HomepageLightboxItem | null>(null);
  const [open, setOpen] = useState<HomepageLightboxItem | null>(null);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/homepage/lightbox")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const rows = (data.items ?? []) as HomepageLightboxItem[];
        setItems(rows);
        setSelected(rows.find((row) => row.imageUrl) ?? null);
      })
      .finally(() => setLoaded(true));
  }, []);

  const withImage = items.filter((item) => item.imageUrl);
  const withoutImage = items.filter((item) => !item.imageUrl);

  useEffect(() => {
    const slides = items.filter((item) => item.imageUrl);
    if (paused || open || slides.length < 2) return;
    const id = window.setInterval(() => {
      setSelected((current) => {
        if (!current) return slides[0]!;
        const index = slides.findIndex((item) => item.id === current.id);
        return slides[(index + 1) % slides.length]!;
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [paused, open, items]);

  if (!loaded || !selected?.imageUrl) return null;

  return (
    <section className="relative z-10 py-16">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-center gap-4">
          <div className="h-8 w-1 rounded-full bg-[#1a3556] dark:bg-[#8aa4c8]" />
          <h2 className="text-2xl font-bold">Past Events</h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <figure className="relative">
            <div className="overflow-hidden rounded-2xl bg-white ring-2 ring-[#FFD700]/60 dark:bg-[#1a3556]/40 dark:ring-[#FFD700]/40">
              <img
                src={selected.imageUrl}
                alt={selected.title}
                decoding="async"
                className="mx-auto max-h-[78vh] w-auto object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(selected)}
              className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#1a3556] px-3 py-1.5 text-xs font-semibold text-[#FFD700] ring-1 ring-[#FFD700]/70 hover:bg-[#152a45] dark:bg-[#0f1a2e]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Expand
            </button>
            <p className="mt-2 text-center text-xs text-[#1a3556]/70 dark:text-[#FFD700]/80">
              {selected.sport} · {selected.era}
            </p>
          </figure>
          <div className="grid max-h-[78vh] grid-cols-3 content-start gap-2 overflow-y-auto p-1 pr-1.5 sm:grid-cols-4 lg:grid-cols-3">
            {withImage.map((item) => {
              const active = item.id === selected.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPaused(true);
                    setSelected(item);
                  }}
                  className={`overflow-hidden rounded-lg bg-white ring-2 transition dark:bg-[#1a3556]/50 ${
                    active ? "ring-[#FFD700]" : "ring-transparent hover:ring-[#FFD700]/50"
                  }`}
                >
                  <img
                    src={item.imageUrl!}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {withoutImage.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {withoutImage.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[#FFD700]/40 bg-white p-4 dark:border-[#FFD700]/25 dark:bg-[#1a3556]/50"
              >
                <p className="text-[11px] uppercase tracking-wider text-[#c8102e] dark:text-[#FFD700]">{item.sport}</p>
                <h3 className="mt-1 text-sm font-bold">{item.title}</h3>
                <p className="mt-1 text-xs text-[#1a3556]/70 dark:text-white/60">{item.era}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      {open?.imageUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a3556]/60 p-4 dark:bg-[#0f1a2e]/85"
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-[#1a3556] p-2 text-[#FFD700] ring-1 ring-[#FFD700]/70 hover:bg-[#152a45]"
            onClick={() => setOpen(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={open.imageUrl}
            alt={open.title}
            className="max-h-[90vh] max-w-[min(90vw,720px)] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}
