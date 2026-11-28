"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { AppNotification } from "@/lib/notifications";
import { usePushOptIn } from "@/hooks/usePushOptIn";

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const { state: pushState, busy, enable, refresh: refreshPushState } = usePushOptIn();

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { notificationAuthHeaders } = await import("@/lib/notificationAuthClient");
      const res = await fetch("/api/notifications/list", { headers: await notificationAuthHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: AppNotification[]; unread: number };
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
    void refreshPushState();
  }, [open, load, refreshPushState]);

  if (!user?.id) return null;

  const markRead = async (id: string) => {
    const { notificationAuthHeaders } = await import("@/lib/notificationAuthClient");
    await fetch("/api/notifications/list", {
      method: "PATCH",
      headers: await notificationAuthHeaders(),
      body: JSON.stringify({ id }),
    });
    void load();
  };

  const markAll = async () => {
    const { notificationAuthHeaders } = await import("@/lib/notificationAuthClient");
    await fetch("/api/notifications/list", {
      method: "PATCH",
      headers: await notificationAuthHeaders(),
      body: JSON.stringify({ all: true }),
    });
    void load();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-stone-600 hover:bg-stone-100"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFA500] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
              <p className="text-sm font-bold text-stone-900">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => void markAll()} className="text-[11px] font-semibold text-[#014421]">
                  Mark all read
                </button>
              )}
            </div>
            {(pushState === "ready" || pushState === "denied") && (
              <div className="border-b border-stone-100 bg-[#014421]/[0.04] px-3 py-2.5">
                <p className="text-xs text-stone-600">
                  {pushState === "denied"
                    ? "Blocked in browser settings — allow notifications for this site, then tap below."
                    : "Phone alerts are off. Enable to get coaching videos and prize wins."}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enable()}
                  className="mt-2 rounded-lg bg-[#014421] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Enabling…" : "Enable phone alerts"}
                </button>
              </div>
            )}
            {pushState === "no_key" && (
              <p className="border-b border-stone-100 px-3 py-2 text-[11px] text-amber-700">
                Push keys not loaded — restart npm run dev after saving VAPID in .env.local.
              </p>
            )}
            <ul className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-stone-400">No notifications yet</li>
              ) : (
                items.map((n) => (
                  <li key={n.id} className={`border-t border-stone-50 ${n.readAt ? "" : "bg-[#014421]/[0.03]"}`}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          void markRead(n.id);
                          setOpen(false);
                        }}
                        className="block px-3 py-2.5 text-left"
                      >
                        <Item n={n} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void markRead(n.id)}
                        className="block w-full px-3 py-2.5 text-left"
                      >
                        <Item n={n} />
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ n }: { n: AppNotification }) {
  return (
    <>
      <span className="block text-sm font-semibold text-stone-900">{n.title}</span>
      <span className="mt-0.5 block text-xs text-stone-500">{n.body}</span>
    </>
  );
}
