"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
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

  const placePanel = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    // Prefer right-align under the bell; clamp so it never leaves the screen.
    let left = r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - 120);
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.max(180, window.innerHeight - top - 16),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open, placePanel]);

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
        ref={btnRef}
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
          <button
            type="button"
            className="fixed inset-0 z-[60] cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            style={panelStyle}
            className="z-[70] flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-900 shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-3 py-2">
              <p className="text-sm font-bold text-stone-900">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => void markAll()} className="text-[11px] font-semibold text-[#014421]">
                  Mark all read
                </button>
              )}
            </div>
            {(pushState === "ready" || pushState === "denied" || pushState === "error") && (
              <div className="shrink-0 border-b border-stone-100 bg-[#014421]/[0.04] px-3 py-2.5">
                <p className="text-xs leading-snug text-stone-600">
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
            <ul className="min-h-0 flex-1 overflow-y-auto">
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
      <span className="block text-sm font-semibold leading-snug text-stone-900">{n.title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-stone-500">{n.body}</span>
    </>
  );
}
