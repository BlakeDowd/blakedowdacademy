"use client";

import { PushOptInCard } from "@/components/notifications/PushOptInCard";

/** App-wide one-time alerts popup (replaces the old home banner). */
export function PushEnableBanner() {
  return <PushOptInCard />;
}
