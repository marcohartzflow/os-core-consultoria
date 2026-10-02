"use client";

import { createContext, useContext, useEffect } from "react";

/** Provided by the settings window: sets (or clears, with null) why it may not close or switch section now. */
export const SettingsLockContext = createContext<((reason: string | null) => void) | null>(null);

/**
 * Keeps the settings window open, on the current section, while `reason` is set: for something on
 * screen that would be lost for good (recovery codes shown once). `reason` is what the person sees
 * on trying to leave. Outside the window (the account gate) it does nothing.
 */
export function useSettingsLock(reason: string | null) {
  const lock = useContext(SettingsLockContext);
  useEffect(() => {
    if (!lock || !reason) return;
    lock(reason);
    return () => lock(null);
  }, [lock, reason]);
}
