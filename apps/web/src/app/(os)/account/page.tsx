"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOpenSettings } from "@/core/settings/SettingsDialog";

/** The account moved to the settings window; old links land on the start page with it open. */
export default function AccountPage() {
  const router = useRouter();
  const openSettings = useOpenSettings();
  useEffect(() => {
    openSettings("perfil");
    router.replace("/");
  }, [openSettings, router]);
  return null;
}
