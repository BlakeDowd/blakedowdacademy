import { Suspense } from "react";
import { Confirmation } from "@/components/booking/Confirmation";

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<p className="p-8 text-[#5d6b64]">Checking the payment…</p>}>
      <Confirmation />
    </Suspense>
  );
}
