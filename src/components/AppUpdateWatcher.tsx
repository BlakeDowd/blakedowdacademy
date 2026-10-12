"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

const THIS_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 10 * 60 * 1000;

async function liveBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: string | null };
    return body.build ?? null;
  } catch {
    return null;
  }
}

/**
 * A phone can keep running an old copy of the app for days when it's left open in the background.
 * Once a newer version is live this offers an update, and loads it on the next page change so a
 * half-filled form is never thrown away.
 */
export default function AppUpdateWatcher() {
  const pathname = usePathname();
  const [outdated, setOutdated] = useState(false);
  const outdatedRef = useRef(false);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (!THIS_BUILD) return;
    const check = () => {
      if (outdatedRef.current || document.visibilityState !== "visible") return;
      void liveBuild().then((build) => {
        if (!build || build === THIS_BUILD) return;
        outdatedRef.current = true;
        setOutdated(true);
      });
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (outdatedRef.current) window.location.reload();
  }, [pathname]);

  if (!outdated) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[95] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl bg-[#014421] px-4 py-2.5 text-white shadow-lg">
        <p className="flex-1 text-sm font-medium">A new version of the app is ready.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-[#014421] hover:bg-stone-100"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Update
        </button>
      </div>
    </div>
  );
}
