"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Loaded<T> {
  /** null while the first load runs, or after `retry`. */
  data: T | null;
  error: unknown;
  /** Fetches again and keeps the current data on screen (after an action changed something). */
  refresh: () => Promise<void>;
  /** Starts over from the loading state (the "Tentar novamente" of an error). */
  retry: () => void;
}

/**
 * Loads data for a screen. `key` names the inputs of `load` (a filter, a page number): when it
 * changes, the data is fetched again. A response that arrives after the key changed is dropped.
 */
export function useLoad<T>(load: () => Promise<T>, key = ""): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(load);

  useEffect(() => {
    latest.current = load;
  });

  useEffect(() => {
    let current = true;
    latest.current().then(
      (value) => {
        if (!current) return;
        setData(value);
        setError(null);
      },
      (e: unknown) => current && setError(e),
    );
    return () => {
      current = false;
    };
  }, [key, attempt]);

  const refresh = useCallback(
    () =>
      latest.current().then(
        (value) => {
          setData(value);
          setError(null);
        },
        (e: unknown) => setError(e),
      ),
    [],
  );

  const retry = useCallback(() => {
    setData(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { data, error, refresh, retry };
}
