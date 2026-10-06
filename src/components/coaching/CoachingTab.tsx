"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import { fetchSpaces, type CoachingSpaceSummary } from "@/lib/coachingFeed";
import { Avatar, rememberNames } from "@/components/coaching/coachingUi";
import { CoachingFeedList } from "@/components/coaching/CoachingFeedList";
import { CoachingSpacesGrid } from "@/components/coaching/CoachingSpacesGrid";
import { CoachingActivity } from "@/components/coaching/CoachingActivity";

type View = "spaces" | "feed" | "activity";

function SubTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: View; label: string; badge?: number }[];
  value: View;
  onChange: (v: View) => void;
}) {
  return (
    <nav className="flex gap-6 border-b border-stone-200 px-1" aria-label="Coaching sections">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-current={value === t.id ? "page" : undefined}
          className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-semibold transition ${
            value === t.id ? "border-[#014421] text-[#014421]" : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          {t.label}
          {t.badge ? (
            <span className="rounded-full bg-[#FFA500] px-1.5 text-[10px] font-bold leading-4 text-white">
              {t.badge > 9 ? "9+" : t.badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

export default function CoachingTab({
  onUnreadChange,
  unreadCount = 0,
}: {
  onUnreadChange?: () => void;
  unreadCount?: number;
}) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [view, setView] = useState<View>(isCoach ? "spaces" : "feed");
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [spaces, setSpaces] = useState<CoachingSpaceSummary[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(isCoach);
  const [spacesError, setSpacesError] = useState<string | null>(null);

  const loadSpaces = useCallback(async () => {
    if (!user?.id || !isCoach) return;
    try {
      const list = await fetchSpaces(createClient(), user.id);
      rememberNames(list.map((s) => [s.studentId, s.name] as [string, string]));
      setSpaces(list);
      setSpacesError(null);
    } catch (err) {
      setSpacesError(err instanceof Error ? err.message : "Couldn't load spaces.");
    } finally {
      setSpacesLoading(false);
    }
  }, [user?.id, isCoach]);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const refreshUnread = useCallback(() => {
    onUnreadChange?.();
  }, [onUnreadChange]);

  if (!user?.id) return null;
  const viewerName = user.fullName || (isCoach ? APP_VIDEO_COACH_NAME : "You");

  if (!isCoach) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={APP_VIDEO_COACH_NAME} coach />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900">Your space with {APP_VIDEO_COACH_NAME}</h2>
            <p className="text-xs text-stone-500">Only you and your coach can see this.</p>
          </div>
        </div>
        <SubTabs
          tabs={[
            { id: "feed", label: "Feed" },
            { id: "activity", label: "Activity", badge: unreadCount },
          ]}
          value={view}
          onChange={setView}
        />
        {view === "activity" ? (
          <CoachingActivity
            viewerId={user.id}
            viewerIsCoach={false}
            spaces={[]}
            onOpenSpace={() => setView("feed")}
            onRead={refreshUnread}
          />
        ) : (
          <CoachingFeedList
            studentId={user.id}
            studentName={user.fullName || "You"}
            viewerId={user.id}
            viewerName={viewerName}
            viewerIsCoach={false}
            spaces={[]}
            onRead={refreshUnread}
          />
        )}
      </div>
    );
  }

  const openSpace = (id: string, name: string) => {
    setOpen({ id, name });
    document.querySelector("main.app-frame-main")?.scrollTo({ top: 0 });
  };

  if (open) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              void loadSpaces();
            }}
            className="rounded-full p-2 text-stone-600 hover:bg-stone-200"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <Avatar name={open.name} userId={open.id} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-900">{open.name}</h2>
            <p className="text-xs text-stone-500">Golf · private space with this student</p>
          </div>
        </div>
        <CoachingFeedList
          key={open.id}
          studentId={open.id}
          studentName={open.name}
          viewerId={user.id}
          viewerName={viewerName}
          viewerIsCoach
          spaces={spaces}
          onRead={refreshUnread}
        />
      </div>
    );
  }

  const unreadSpaces = spaces.filter((s) => s.unread).length;

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={[
          { id: "spaces", label: "Spaces", badge: unreadSpaces },
          { id: "feed", label: "Feed" },
          { id: "activity", label: "Activity", badge: unreadCount },
        ]}
        value={view}
        onChange={(v) => {
          setView(v);
          if (v === "spaces") void loadSpaces();
        }}
      />
      {view === "spaces" && spacesError ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{spacesError}</p>
      ) : view === "spaces" ? (
        <CoachingSpacesGrid spaces={spaces} loading={spacesLoading} onOpen={openSpace} />
      ) : view === "feed" ? (
        <CoachingFeedList
          viewerId={user.id}
          viewerName={viewerName}
          viewerIsCoach
          spaces={spaces}
          onOpenSpace={openSpace}
        />
      ) : (
        <CoachingActivity
          viewerId={user.id}
          viewerIsCoach
          spaces={spaces}
          onOpenSpace={openSpace}
          onOpenFeed={() => setView("feed")}
          onRead={() => {
            refreshUnread();
            void loadSpaces();
          }}
        />
      )}
    </div>
  );
}
