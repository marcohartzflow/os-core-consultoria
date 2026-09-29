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
  /** A fetch for the current key is in flight (data may still hold the previous key's result). */
  loading: boolean;
}

/**
 * Loads data for a screen. `key` names the inputs of `load` (a filter, a page number): when it
 * changes, the data is fetched again. A response that arrives after the key changed is dropped.
 */
export function useLoad<T>(load: () => Promise<T>, key = ""): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  // The key (and attempt) whose response is on screen; differs from the current one while loading.
  const [settled, setSettled] = useState<string | null>(null);
  const current = `${attempt}:${key}`;
  const latest = useRef(load);

  useEffect(() => {
    latest.current = load;
  });

  useEffect(() => {
    let active = true;
    const requested = `${attempt}:${key}`;
    latest.current().then(
      (value) => {
        if (!active) return;
        setData(value);
        setError(null);
        setSettled(requested);
      },
      (e: unknown) => {
        if (!active) return;
        setError(e);
        setSettled(requested);
      },
    );
    return () => {
      active = false;
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

  return { data, error, refresh, retry, loading: settled !== current };
}
