"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import type { CoachingSpaceSummary } from "@/lib/coachingFeed";
import { fetchSpaces } from "@/lib/coachingSpaces";
import { Avatar, rememberNames } from "@/components/coaching/coachingUi";
import { CoachingFeedList } from "@/components/coaching/CoachingFeedList";
import { CoachingSpacesGrid } from "@/components/coaching/CoachingSpacesGrid";
import { CoachingActivity } from "@/components/coaching/CoachingActivity";
import { CoachingUsage } from "@/components/coaching/CoachingUsage";
import { AssignedOverview, AssignmentsPanel } from "@/components/coaching/CoachingAssignments";
import { NewSpaceSheet, PendingInviteBanner } from "@/components/coaching/CoachingInvites";
import { PlayerEmail } from "@/components/coaching/PlayerEmail";
import { TestPlayerButton } from "@/components/coaching/TestPlayerButton";
import { CoachingFamilies } from "@/components/coaching/CoachingFamilies";

type View = "spaces" | "feed" | "activity" | "assigned" | "usage" | "families";

const OPEN_SPACE_KEY = "coaching:open-space";

function readOpenSpace(): { id: string; name: string } | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(OPEN_SPACE_KEY) ?? "null");
    return parsed && typeof parsed.id === "string" && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeOpenSpace(space: { id: string; name: string } | null) {
  try {
    if (space) sessionStorage.setItem(OPEN_SPACE_KEY, JSON.stringify(space));
    else sessionStorage.removeItem(OPEN_SPACE_KEY);
  } catch {
    /* storage unavailable */
  }
}

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
    <nav
      className={`flex border-b border-stone-200 px-1 ${tabs.length > 4 ? "justify-between gap-2" : "gap-6"}`}
      aria-label="Coaching sections"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-current={value === t.id ? "page" : undefined}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm font-semibold transition ${
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
  const [creating, setCreating] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);
  const closeCreating = useCallback(() => setCreating(false), []);

  const restoredOpenRef = useRef(false);

  const loadSpaces = useCallback(async () => {
    if (!user?.id || !isCoach) return;
    try {
      const list = await fetchSpaces(createClient(), user.id);
      rememberNames(list.map((s) => [s.studentId, s.name] as [string, string]));
      setSpaces(list);
      if (!restoredOpenRef.current) {
        restoredOpenRef.current = true;
        const last = readOpenSpace();
        if (last && list.some((s) => s.studentId === last.id)) setOpen(last);
      }
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
        <AssignmentsPanel studentId={user.id} viewerId={user.id} viewerIsCoach={false} />
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
    writeOpenSpace({ id, name });
    document.querySelector("main.app-frame-main")?.scrollTo({ top: 0 });
  };

  if (open) {
    const pending = spaces.find((s) => s.studentId === open.id)?.space;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              writeOpenSpace(null);
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
            <p className="text-xs text-stone-500">
              {pending?.pending ? "Invited · hasn't joined yet" : "Golf · private space with this student"}
            </p>
            {!pending?.pending && <PlayerEmail key={open.id} playerId={open.id} playerName={open.name} />}
          </div>
        </div>
        {!pending?.pending && <TestPlayerButton playerId={open.id} playerName={open.name} className="w-full" />}
        {pending?.pending && (
          <PendingInviteBanner
            spaceId={pending.id}
            inviteCode={pending.inviteCode}
            playerName={open.name}
            coachName={viewerName}
            onDeleted={() => {
              setOpen(null);
              void loadSpaces();
            }}
          />
        )}
        <AssignmentsPanel
          key={`assign-${open.id}`}
          studentId={open.id}
          studentName={open.name}
          viewerId={user.id}
          viewerIsCoach
          onAssigned={() => setFeedVersion((v) => v + 1)}
        />
        <CoachingFeedList
          key={`${open.id}-${feedVersion}`}
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
          { id: "assigned", label: "Assigned" },
          { id: "usage", label: "Usage" },
          { id: "families", label: "Families" },
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
        <CoachingSpacesGrid
          spaces={spaces}
          loading={spacesLoading}
          onOpen={openSpace}
          onNew={() => setCreating(true)}
        />
      ) : view === "feed" ? (
        <CoachingFeedList
          viewerId={user.id}
          viewerName={viewerName}
          viewerIsCoach
          spaces={spaces}
          onOpenSpace={openSpace}
        />
      ) : view === "assigned" ? (
        <AssignedOverview viewerId={user.id} spaces={spaces} onOpenSpace={openSpace} />
      ) : view === "usage" ? (
        <CoachingUsage viewerId={user.id} spaces={spaces} onOpenSpace={openSpace} />
      ) : view === "families" ? (
        <CoachingFamilies
          coachName={viewerName}
          onOpenSpace={openSpace}
          onChanged={() => void loadSpaces()}
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
      {creating && (
        <NewSpaceSheet
          coachId={user.id}
          coachName={viewerName}
          existingIds={new Set(spaces.map((s) => s.studentId))}
          onClose={closeCreating}
          onCreated={() => void loadSpaces()}
          onOpenSpace={(key, name) => {
            setCreating(false);
            openSpace(key, name);
          }}
        />
      )}
    </div>
  );
}
