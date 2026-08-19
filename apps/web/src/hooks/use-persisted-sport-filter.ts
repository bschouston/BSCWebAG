"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { loadSportFilter, saveSportFilter } from "@/lib/sport-filter-storage";

export function usePersistedSportFilter(keyPrefix: string) {
  const { user } = useAuth();
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [sportFilterReady, setSportFilterReady] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setSelectedSports(loadSportFilter(keyPrefix, user.uid));
    setSportFilterReady(true);
  }, [user?.uid, keyPrefix]);

  const toggleSportFilter = useCallback(
    (sportId: string) => {
      if (!user?.uid) return;
      setSelectedSports((prev) => {
        const next = prev.includes(sportId) ? prev.filter((id) => id !== sportId) : [...prev, sportId];
        saveSportFilter(keyPrefix, user.uid, next);
        return next;
      });
    },
    [keyPrefix, user?.uid]
  );

  const clearSportFilter = useCallback(() => {
    if (!user?.uid) return;
    setSelectedSports([]);
    saveSportFilter(keyPrefix, user.uid, []);
  }, [keyPrefix, user?.uid]);

  return { selectedSports, sportFilterReady, toggleSportFilter, clearSportFilter };
}
