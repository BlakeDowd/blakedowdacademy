import { redirect } from "next/navigation";

/** Kept for any lingering imports after Stats moved to /profile. */
export { getBenchmarkGoals } from "@/lib/benchmarkGoals";

export default function StatsRedirectPage() {
  redirect("/profile");
}
