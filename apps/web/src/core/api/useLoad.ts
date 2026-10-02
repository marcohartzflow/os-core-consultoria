"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "./client";

export interface Loaded<T> {
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
 * `load` receives an AbortSignal to pass on to `api()`: the request is cancelled when the key
 * changes, the screen unmounts or a refresh replaces it.
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, key = ""): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  // The key (and attempt) whose response is on screen; differs from the current one while loading.
  const [settled, setSettled] = useState<string | null>(null);
  const current = `${attempt}:${key}`;
  const latest = useRef(load);
  // The key of the inputs on screen now, read by `refresh` when it starts.
  const currentRef = useRef(current);
  // Number of the latest request started (a load or a refresh): only that one may write, so an
  // older answer arriving late never replaces a newer one.
  const sequence = useRef(0);
  // The latest request started (a load or a refresh), cancelled when a newer one replaces it.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current = load;
    currentRef.current = current;
  });

  // The cleanup aborts the fetch and ignores its result (react.dev, "Synchronizing with Effects").
  useEffect(() => {
    let active = true;
    const id = ++sequence.current;
    const requested = `${attempt}:${key}`;
    const controller = new AbortController();
    inFlight.current = controller;
    latest.current(controller.signal).then(
      (value) => {
        if (!active || sequence.current !== id) return;
        setData(value);
        setError(null);
        setSettled(requested);
      },
      (e: unknown) => {
        if (!active || sequence.current !== id || isAbortError(e)) return;
        setError(e);
        setSettled(requested);
      },
    );
    return () => {
      active = false;
      // This load, or a refresh that replaced it: both asked for the inputs being left.
      inFlight.current?.abort();
    };
  }, [key, attempt]);

  // A refresh started for inputs that changed before it answered (a filter changed right after a
  // row action) is dropped: the load of the new inputs started after it. A refresh that overtakes
  // the load of the same inputs answers for it.
  const refresh = useCallback(() => {
    const id = ++sequence.current;
    const requested = currentRef.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    return latest.current(controller.signal).then(
      (value) => {
        if (sequence.current !== id) return;
        setData(value);
        setError(null);
        setSettled(requested);
      },
      (e: unknown) => {
        if (sequence.current !== id || isAbortError(e)) return;
        setError(e);
        setSettled(requested);
      },
    );
  }, []);

  const retry = useCallback(() => {
    setData(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { data, error, refresh, retry, loading: settled !== current };
}
