"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, Lock, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import {
  AUTO_JOIN_PARAM,
  acceptInvite,
  clearPendingInvite,
  fetchInvitePreview,
  normalizeInviteCode,
  rememberPendingInvite,
  type InvitePreview,
} from "@/lib/coachingSpaces";
import {
  acceptFamilyInvite,
  fetchFamilyInvitePreview,
  isFamilyInviteCode,
  type FamilyInvitePreview,
} from "@/lib/family";

const COACHING_HREF = "/profile?tab=coaching";
/** Home, where "Who's practising?" opens for a family login. */
const FAMILY_HOME = "/";

type Loaded = { key: string; preview: InvitePreview | null } | { key: string; error: string };

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Blake Dowd Golf" className="w-48 object-contain" />
        </div>
        <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">{children}</div>
      </div>
    </div>
  );
}

const primary =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-[#014421] px-4 py-3 text-sm font-semibold text-white hover:bg-[#013320] disabled:opacity-50";
const secondary =
  "flex w-full items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeInviteCode(decodeURIComponent(params?.code ?? ""));
  return isFamilyInviteCode(code) ? <JoinFamily code={code} /> : <JoinSpace code={code} />;
}

type FamilyLoaded = { key: string; preview: FamilyInvitePreview | null } | { key: string; error: string };

function JoinFamily({ code }: { code: string }) {
  const { user, isAuthenticated, loading } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [loaded, setLoaded] = useState<FamilyLoaded | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const loadKey = `${code}:${user?.id ?? ""}`;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const autoJoin =
      isAuthenticated && !isCoach && new URLSearchParams(window.location.search).get(AUTO_JOIN_PARAM) === "1";
    void (async () => {
      try {
        const preview = await fetchFamilyInvitePreview(code);
        if (cancelled) return;
        if (preview && !isAuthenticated) rememberPendingInvite(code, "");
        else if (!preview || preview.isMember) clearPendingInvite();
        if (autoJoin && preview?.isMember) {
          window.location.assign(FAMILY_HOME);
          return;
        }
        if (autoJoin && preview) {
          try {
            await acceptFamilyInvite(code);
            clearPendingInvite();
            window.location.assign(FAMILY_HOME);
            return;
          } catch (err) {
            if (cancelled) return;
            setJoinError(err instanceof Error ? err.message : "Couldn't join the family.");
          }
        }
        setLoaded({ key: loadKey, preview });
      } catch (err) {
        if (!cancelled) setLoaded({ key: loadKey, error: err instanceof Error ? err.message : "Couldn't load the invite." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loading, loadKey, isAuthenticated, isCoach]);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await acceptFamilyInvite(code);
      clearPendingInvite();
      window.location.assign(FAMILY_HOME);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Couldn't join the family.");
      setJoining(false);
    }
  };

  const current = loaded?.key === loadKey ? loaded : null;

  if (loading || !current) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading invite…
        </div>
      </Card>
    );
  }

  if ("error" in current) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Couldn&apos;t load this invite</h1>
        <p className="text-sm text-gray-600">{current.error}</p>
        <Link href="/" onClick={clearPendingInvite} className={secondary}>
          Go to the app
        </Link>
      </Card>
    );
  }

  const { preview } = current;

  if (!preview) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Family link not valid</h1>
        <p className="text-sm text-gray-600">This link may have been replaced or mistyped. Ask your coach for a new one.</p>
        {isAuthenticated && (
          <Link href="/" className={secondary}>
            Go to the app
          </Link>
        )}
      </Card>
    );
  }

  if (preview.isMember) {
    return (
      <Card>
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#014421]" aria-hidden />
        <h1 className="text-lg font-bold text-gray-900">You&apos;re already in</h1>
        <p className="text-sm text-gray-600">This account is the login for {preview.familyName}.</p>
        <Link href={FAMILY_HOME} className={primary}>
          Open the app
        </Link>
      </Card>
    );
  }

  const kids =
    preview.playerCount === 0
      ? "your kids"
      : preview.playerCount === 1
        ? "your junior golfer"
        : `your ${preview.playerCount} junior golfers`;

  return (
    <Card>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#014421]/10 text-[#014421]">
        <Users className="h-7 w-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-gray-900">{preview.familyName}</h1>
        <p className="text-sm text-gray-600">
          {preview.coachName} has set up {kids} on the app. Sign in once on the family phone and each child taps their
          face to log practice and track their progress.
        </p>
      </div>

      {!isAuthenticated ? (
        <div className="space-y-2">
          <Link href="/login?mode=signup" className={primary}>
            Create the family login
          </Link>
          <Link href="/login" className={secondary}>
            I already have an account
          </Link>
        </div>
      ) : isCoach ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You&apos;re signed in as a coach. Send this link to the parent so they can join.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            You&apos;re signed in as {user?.fullName || "this account"}. It will become a login for {preview.familyName}.
          </p>
          <button type="button" onClick={() => void join()} disabled={joining} className={primary}>
            {joining && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Join {preview.familyName}
          </button>
          <Link href="/" onClick={clearPendingInvite} className={secondary}>
            Not now
          </Link>
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
        </div>
      )}
    </Card>
  );
}

function JoinSpace({ code }: { code: string }) {
  const { user, isAuthenticated, loading } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadKey = `${code}:${user?.id ?? ""}`;

  useEffect(() => {
    if (loading || !code) return;
    let cancelled = false;
    const autoJoin =
      isAuthenticated && !isCoach && new URLSearchParams(window.location.search).get(AUTO_JOIN_PARAM) === "1";
    void (async () => {
      try {
        const preview = await fetchInvitePreview(createClient(), code);
        if (cancelled) return;
        if (preview && !preview.joined && !isAuthenticated) rememberPendingInvite(code, preview.displayName);
        else if (!preview || preview.joined) clearPendingInvite();
        if (autoJoin && preview?.joinedByYou) {
          window.location.assign(COACHING_HREF);
          return;
        }
        if (autoJoin && preview && !preview.joined) {
          try {
            await acceptInvite(createClient(), code);
            clearPendingInvite();
            window.location.assign(COACHING_HREF);
            return;
          } catch (err) {
            if (cancelled) return;
            setJoinError(err instanceof Error ? err.message : "Couldn't join the space.");
          }
        }
        setLoaded({ key: loadKey, preview });
      } catch (err) {
        if (!cancelled) setLoaded({ key: loadKey, error: err instanceof Error ? err.message : "Couldn't load the invite." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, loading, loadKey, isAuthenticated, isCoach]);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      await acceptInvite(createClient(), code);
      clearPendingInvite();
      window.location.assign(COACHING_HREF);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Couldn't join the space.");
      setJoining(false);
    }
  };

  const current = loaded?.key === loadKey ? loaded : null;

  if (!code) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Invite link not valid</h1>
        <p className="text-sm text-gray-600">Ask your coach to send the link again.</p>
      </Card>
    );
  }

  if (loading || !current) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading invite…
        </div>
      </Card>
    );
  }

  if ("error" in current) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Couldn&apos;t load this invite</h1>
        <p className="text-sm text-gray-600">{current.error}</p>
        <Link href="/" onClick={clearPendingInvite} className={secondary}>
          Go to the app
        </Link>
      </Card>
    );
  }

  const { preview } = current;

  if (!preview) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Invite link not valid</h1>
        <p className="text-sm text-gray-600">
          This link may have been deleted or mistyped. Ask your coach to send a new one.
        </p>
        {isAuthenticated && (
          <Link href="/profile" className={secondary}>
            Go to the app
          </Link>
        )}
      </Card>
    );
  }

  if (preview.joinedByYou) {
    return (
      <Card>
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#014421]" aria-hidden />
        <h1 className="text-lg font-bold text-gray-900">You&apos;re already in</h1>
        <p className="text-sm text-gray-600">This is your private coaching space with {preview.coachName}.</p>
        <Link href={COACHING_HREF} className={primary}>
          Open coaching
        </Link>
      </Card>
    );
  }

  if (preview.joined) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-gray-900">Invite already used</h1>
        <p className="text-sm text-gray-600">
          Someone has already joined with this link. Ask {preview.coachName} for a new invite.
        </p>
        {isAuthenticated && (
          <Link href="/profile" className={secondary}>
            Go to the app
          </Link>
        )}
      </Card>
    );
  }

  const greeting = preview.displayName.trim().split(/\s+/)[0];

  return (
    <Card>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#014421]/10 text-[#014421]">
        <UserPlus className="h-7 w-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-gray-900">Hi {greeting}</h1>
        <p className="text-sm text-gray-600">
          {preview.coachName} has set up a private coaching space for you to share swings and feedback.
        </p>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        Only you and your coach can see it.
      </p>

      {!isAuthenticated ? (
        <div className="space-y-2">
          <Link href="/login?mode=signup" className={primary}>
            Create my account
          </Link>
          <Link href="/login" className={secondary}>
            I already have an account
          </Link>
        </div>
      ) : isCoach ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You&apos;re signed in as a coach. Send this link to {greeting} so they can join.
        </p>
      ) : (
        <div className="space-y-2">
          <button type="button" onClick={() => void join()} disabled={joining} className={primary}>
            {joining && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Join {preview.coachName}&apos;s space
          </button>
          <Link href="/profile" onClick={clearPendingInvite} className={secondary}>
            Not now
          </Link>
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
        </div>
      )}
    </Card>
  );
}
