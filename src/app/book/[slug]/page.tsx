import { Suspense } from "react";
import { OfferFlow } from "@/components/booking/OfferFlow";

export default async function OfferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="p-8 text-[#5d6b64]">Loading…</p>}>
      <OfferFlow slug={slug} />
    </Suspense>
  );
}
