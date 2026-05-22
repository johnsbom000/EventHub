import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "eventhub:sidebar-badge-baseline:";

type UseResettableBadgeCountOptions = {
  id: string;
  count: number;
};

export function useResettableBadgeCount({ id, count }: UseResettableBadgeCountOptions) {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const safeCount = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);

  const [baseline, setBaseline] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    const parsed = Number(raw);
    const nextBaseline = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
    setBaseline(nextBaseline);
  }, [storageKey]);

  useEffect(() => {
    if (safeCount >= baseline) return;
    setBaseline(safeCount);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(safeCount));
    }
  }, [baseline, safeCount, storageKey]);

  const dismissCurrent = useCallback(() => {
    setBaseline(safeCount);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(safeCount));
    }
  }, [safeCount, storageKey]);

  const visibleCount = useMemo(() => Math.max(0, safeCount - baseline), [baseline, safeCount]);

  return { visibleCount, dismissCurrent };
}
