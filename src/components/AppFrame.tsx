"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CombineForParamSync } from "@/hooks/useCombineUser";
import ConditionalNavbar from "./ConditionalNavbar";
import ScreenTracker from "./ScreenTracker";
import { CoachTestingBanner } from "./combine/CoachTestingBanner";
import { FamilySwitcher } from "./family/FamilySwitcher";
import { PushEnableBanner } from "@/components/notifications/PushEnableBanner";
import { registerPushWorker } from "@/lib/pushClient";

export default function AppFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isBooking = pathname.startsWith("/book");

  useEffect(() => {
    void registerPushWorker();
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; href?: string } | undefined;
      if (data?.type === "notification-click" && data.href) {
        router.push(data.href);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  if (isBooking) {
    return <div className="min-h-screen w-full bg-[#f7f8f7]">{children}</div>;
  }

  return (
    <div
      className="app-frame-outer h-screen w-full flex justify-center bg-gray-100 overflow-hidden"
      style={{ overflowX: "clip" }}
    >
      <ScreenTracker />
      <div
        className="app-frame-inner h-full w-full max-w-md flex flex-col bg-gray-50 shadow-2xl relative border-x border-gray-200 transition-all"
      >
        <Suspense fallback={null}>
          <CombineForParamSync />
        </Suspense>
        <CoachTestingBanner />
        <FamilySwitcher />
        <PushEnableBanner />
        <main
          className="app-frame-main flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-clip pb-36"
          style={{ overflowX: "clip" }}
        >
          {children}
        </main>
        <footer className="print:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
          <ConditionalNavbar />
        </footer>
      </div>
    </div>
  );
}
