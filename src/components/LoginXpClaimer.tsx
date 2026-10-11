"use client";

import { useEffect, useRef, useState } from "react";
import Toast from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { claimLoginXp, loginXpMessage } from "@/lib/loginXp";

/** Claims the daily login XP when the app opens or comes back to the front, and says so. */
export default function LoginXpClaimer() {
  const { user, refreshUser } = useAuth();
  const userId = user?.id;
  const [message, setMessage] = useState<string | null>(null);
  const refreshRef = useRef(refreshUser);

  useEffect(() => {
    refreshRef.current = refreshUser;
  }, [refreshUser]);

  useEffect(() => {
    if (!userId) return;
    const claim = () => {
      void claimLoginXp().then((result) => {
        const text = result ? loginXpMessage(result) : null;
        if (!text) return;
        setMessage(text);
        void refreshRef.current?.();
      });
    };
    claim();
    const onVisible = () => {
      if (document.visibilityState === "visible") claim();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  return message ? <Toast message={message} type="success" onClose={() => setMessage(null)} /> : null;
}
