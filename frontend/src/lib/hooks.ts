import { useCallback, useEffect, useRef, useState } from "react";

/** Fetch now, then every `interval` ms while the tab is visible. */
export function usePoll<T>(fn: () => Promise<T>, interval = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!interval) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);
    return () => window.clearInterval(id);
  }, [refresh, interval]);

  return { data, error, loading, refresh, setData };
}
