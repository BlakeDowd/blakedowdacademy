"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Loader2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/coaching/coachingUi";
import {
  fetchFamilyPlayers,
  hasPickedPlayer,
  markPlayerPicked,
  switchToPlayer,
  type FamilyPlayer,
} from "@/lib/family";

const HIDDEN_ON = ["/login", "/finish-profile", "/reset-password", "/auth", "/join"];

function WhoIsPractising({
  players,
  currentId,
  dismissible,
  onClose,
}: {
  players: FamilyPlayer[];
  currentId: string;
  dismissible: boolean;
  onClose: () => void;
}) {
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (player: FamilyPlayer) => {
    if (switching) return;
    if (player.id === currentId) {
      markPlayerPicked();
      onClose();
      return;
    }
    setSwitching(player.id);
    setError(null);
    try {
      await switchToPlayer(currentId, player.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch player.");
      setSwitching(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-center bg-[#014421]">
      <div className="flex w-full max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{players[0]?.familyName}</p>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/80 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        <h1 className="mt-6 text-center text-2xl font-extrabold text-white">Who&apos;s practising?</h1>
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void pick(p)}
                disabled={Boolean(switching)}
                className="group flex w-full flex-col items-center gap-2 disabled:opacity-60"
              >
                <span
                  className={`relative rounded-full p-1 transition ${
                    p.id === currentId ? "ring-4 ring-[#FFA500]" : "ring-2 ring-white/20 group-hover:ring-white/60"
                  }`}
                >
                  <Avatar name={p.name} size="lg" userId={p.id} />
                  {switching === p.id && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                      <Loader2 className="h-7 w-7 animate-spin text-white" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-base font-bold text-white">{p.name}</span>
                <span className="-mt-1.5 text-[11px] font-semibold text-white/60">
                  {p.id === currentId ? "Signed in now" : p.role === "guardian" ? "Parent" : "Junior"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-6 rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Family devices: a "Who's practising?" screen when the app opens, and a bar showing whose
 * account is active with a one-tap switch.
 */
export function FamilySwitcher() {
  const { user } = useAuth();
  const pathname = usePathname();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<{ userId: string; players: FamilyPlayer[] } | null>(null);
  const [pickerOpen, setPickerOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchFamilyPlayers().then((players) => {
      if (!cancelled) setLoaded({ userId, players });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const players = loaded && loaded.userId === userId ? loaded.players : [];
  const inFamily = players.length > 1 && players.some((p) => p.id === userId);
  if (!userId || !inFamily || HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  const showPicker = pickerOpen ?? !hasPickedPlayer();
  const me = players.find((p) => p.id === userId)!;

  return (
    <>
      <div className="print:hidden shrink-0 bg-[#014421] px-4 py-1.5 text-white">
        <div className="flex items-center gap-2">
          <Avatar name={me.name} size="sm" userId={me.id} />
          <p className="min-w-0 flex-1 truncate text-xs">
            Playing as <span className="font-bold">{me.name}</span>
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
            Switch
          </button>
        </div>
      </div>
      {showPicker && (
        <WhoIsPractising
          players={players}
          currentId={userId}
          dismissible={pickerOpen === true}
          onClose={() => {
            markPlayerPicked();
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
