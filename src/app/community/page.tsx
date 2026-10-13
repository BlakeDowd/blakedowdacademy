"use client";

import dynamic from "next/dynamic";

// Depends on the signed-in user (coaches get an Approvals tab), which only exists in the browser.
const CommunityScreen = dynamic(
  () => import("@/components/community/CommunityScreen").then((m) => m.CommunityScreen),
  { ssr: false },
);

export default function CommunityPage() {
  return <CommunityScreen />;
}
