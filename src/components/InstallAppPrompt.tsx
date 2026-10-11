"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  AddToHomeScreenGuide,
  detectPhonePlatform,
  isInstalledApp,
  type PhonePlatform,
} from "@/components/AddToHomeScreenGuide";

const SEEN_KEY = "installAppPromptSeen";
/** Set when the home page "Save app to your phone" banner is dismissed. */
const BANNER_DISMISSED_KEY = "homeInstallBannerDismissed";
const SHOW_AFTER_MS = 1500;

/** One-time pop-up on a phone's browser showing how to save the app to the home screen. */
export function InstallAppPrompt() {
  const [platform, setPlatform] = useState<PhonePlatform | null>(null);

  useEffect(() => {
    const phone = detectPhonePlatform();
    if (!phone || isInstalledApp()) return;
    try {
      if (localStorage.getItem(SEEN_KEY) === "1" || localStorage.getItem(BANNER_DISMISSED_KEY) === "1") return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setPlatform(phone), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setPlatform(null);
  };

  if (!platform) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Save app to your phone"
      onClick={close}
    >
      <div className="relative w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
        <AddToHomeScreenGuide platform={platform} />
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={close}
          className="w-full rounded-xl bg-[#014421] py-3 text-sm font-bold text-white shadow-sm hover:bg-[#013320]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
