"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SKILL_LEVELS, DEFAULT_SPORTS, type CatalogItem } from "@/lib/sports-catalog";

export function useSportsCatalog() {
  const [sports, setSports] = useState<CatalogItem[]>(
    DEFAULT_SPORTS.map((s) => ({ ...s, id: s.slug }))
  );
  const [skillLevels, setSkillLevels] = useState<CatalogItem[]>(
    DEFAULT_SKILL_LEVELS.map((s) => ({ ...s, id: s.slug }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sports-catalog");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.sports) && data.sports.length) setSports(data.sports);
        if (Array.isArray(data.skillLevels) && data.skillLevels.length) {
          setSkillLevels(data.skillLevels);
        }
      } catch (err) {
        console.error("sports catalog:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { sports, skillLevels, loading };
}
