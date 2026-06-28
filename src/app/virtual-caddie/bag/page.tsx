"use client";

import Link from "next/link";
import { Suspense, useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MyDigitalBag } from "@/components/PlaysLikeBagConfig";
import { PlaysLikeCalculator } from "@/components/PlaysLikeShotBlueprint";
import type { PlaysLikeClubFormState } from "@/lib/playsLikeBag";

function BagConfigFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2d8a5c] border-t-transparent" />
    </div>
  );
}

export default function VirtualCaddieBagPage() {
  const [bagReady, setBagReady] = useState(false);
  const [liveBagClubs, setLiveBagClubs] = useState<PlaysLikeClubFormState[]>([]);
  const [calcRefreshKey, setCalcRefreshKey] = useState(0);

  const handleLoadComplete = useCallback(() => setBagReady(true), []);
  const handleClubsChange = useCallback((clubs: PlaysLikeClubFormState[]) => {
    setLiveBagClubs(clubs);
  }, []);
  const handleSaveSuccess = useCallback(() => {
    setCalcRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-full bg-[#f4f6f4]">
      <header className="bg-[#014421] px-4 pb-4 pt-3 text-white shadow-md">
        <Link
          href="/virtual-caddie"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Plays Like setup
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Bag setup</h1>
        <p className="mt-1 text-xs font-medium text-white/80">
          Club carry (metres) &amp; launch-monitor ball flight
        </p>
      </header>
      <div className="px-4 py-6 sm:py-8">
        <Suspense fallback={<BagConfigFallback />}>
          <MyDigitalBag
            onLoadComplete={handleLoadComplete}
            onClubsChange={handleClubsChange}
            onSaveSuccess={handleSaveSuccess}
          />
        </Suspense>
        {bagReady ? (
          <div className="mx-auto mt-8 w-full max-w-2xl border-t border-gray-200 pt-8">
            <PlaysLikeCalculator key={calcRefreshKey} liveBagClubs={liveBagClubs} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
