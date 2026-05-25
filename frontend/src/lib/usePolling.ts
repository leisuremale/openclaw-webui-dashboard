import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isAbort } from './api';

interface PollingState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Polls a fetcher on an interval. Differs from the inline pattern that used
 * to live in every component by:
 *
 *   - Per-tick AbortController. A new tick aborts the previous in-flight
 *     request, so slow ticks can't trample fresher data.
 *   - Sequence number guards setState against out-of-order resolution.
 *   - First-load `loading` flag flips to false on EITHER success or error,
 *     so a one-shot failure renders an error state instead of an eternal
 *     skeleton.
 *   - Subsequent ticks never set loading=true, so refresh icons don't flash.
 *
 * The fetcher is held in a ref so its identity doesn't restart the polling
 * loop on every render. Pass the same `deps` shape you'd give to useEffect
 * when the fetcher genuinely depends on changing values (e.g. log tab).
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: ReadonlyArray<unknown> = [],
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  // Assign the ref in a layout effect rather than during render — assigning
  // during render is flagged by react-hooks/refs (and can race with concurrent
  // rendering).
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    let inflight: AbortController | null = null;
    let isFirst = true;
    let seq = 0;

    const tick = () => {
      if (inflight) inflight.abort();
      const ac = new AbortController();
      inflight = ac;
      const mySeq = ++seq;
      fetcherRef
        .current(ac.signal)
        .then((d) => {
          if (cancelled || mySeq !== seq) return;
          setData(d);
          setError(null);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (isAbort(err)) return;
          if (mySeq !== seq) return;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('usePolling fetch failed:', err);
          setError(msg);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        });
    };

    tick();
    const iv = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
      if (inflight) inflight.abort();
    };
    // Intentional: fetcher is read through ref; deps are user-supplied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, loading, error };
}
