"use client";

import { Share, Smartphone } from "lucide-react";

export function AddToHomeScreenGuide() {
  return (
    <div className="w-full">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
          <h2 className="text-base font-bold text-gray-900">Save app to your phone</h2>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Add Golf App to your home screen for quick access — like a native app.
        </p>

        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#014421]">
              iPhone (Safari)
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-gray-700">
              <li>Open this site in Safari.</li>
              <li>
                Tap the <Share className="mb-0.5 inline h-4 w-4 align-text-bottom" /> Share button
                at the bottom of the screen.
              </li>
              <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
              <li>Tap <span className="font-semibold">Add</span> in the top-right corner.</li>
            </ol>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#014421]">
              Android (Chrome)
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-gray-700">
              <li>Open this site in Chrome.</li>
              <li>
                Tap the <span className="font-semibold">menu</span> (⋮) in the top-right corner.
              </li>
              <li>
                Tap <span className="font-semibold">Add to Home screen</span> or{" "}
                <span className="font-semibold">Install app</span>.
              </li>
              <li>Confirm by tapping <span className="font-semibold">Add</span> or{" "}
                <span className="font-semibold">Install</span>.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
