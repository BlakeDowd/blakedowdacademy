"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Avoid "go" — too easy to collide with golf talk / stage name "Go". */
const START_RE = /\b(start|begin)\b/i;
const STOP_RE = /\b(stop|pause|finish)\b/i;

/**
 * Listens for spoken "start" / "stop" to drive a timer.
 * Only the latest utterance is matched (never the full cumulative transcript).
 */
export function useVoiceTimerCommands({
  enabled,
  running,
  onStart,
  onStop,
}: {
  enabled: boolean;
  /** When true, only "stop" is accepted; when false, only "start". */
  running: boolean;
  onStart: () => void;
  onStop: () => void;
}): { listening: boolean; supported: boolean; error: string | null } {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && getSpeechRecognition() != null;
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);
  const runningRef = useRef(running);
  const lastCmdAt = useRef(0);
  const lastHeardRef = useRef("");

  useEffect(() => {
    onStartRef.current = onStart;
    onStopRef.current = onStop;
  }, [onStart, onStop]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    if (!enabled) {
      setListening(false);
      setError(null);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Voice commands need Chrome or Edge on this device.");
      setListening(false);
      return;
    }

    let alive = true;
    let rec: SpeechRec | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const fire = (kind: "start" | "stop") => {
      const now = Date.now();
      if (now - lastCmdAt.current < 1000) return;
      lastCmdAt.current = now;
      if (kind === "start") onStartRef.current();
      else onStopRef.current();
    };

    const handleUtterance = (raw: string) => {
      const text = raw.trim().toLowerCase();
      if (!text || text === lastHeardRef.current) return;
      lastHeardRef.current = text;

      const wantsStop = STOP_RE.test(text);
      const wantsStart = START_RE.test(text);
      if (!wantsStop && !wantsStart) return;

      if (runningRef.current) {
        if (wantsStop) fire("stop");
      } else if (wantsStart) {
        fire("start");
      }
    };

    const scheduleRestart = () => {
      if (!alive || !rec) return;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (!alive || !rec) return;
        try {
          rec.start();
          // Keep listening=true — don't flicker the UI on every browser restart.
          setListening(true);
        } catch {
          // Instance is dead; rebuild once.
          try {
            build();
          } catch {
            setListening(false);
          }
        }
      }, 400);
    };

    const build = () => {
      if (!alive) return;
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-AU";
      rec.onresult = (ev) => {
        const chunk = ev.results[ev.resultIndex];
        const transcript = chunk?.[0]?.transcript ?? "";
        if (!transcript.trim()) return;
        if (chunk?.isFinal) handleUtterance(transcript);
      };
      rec.onerror = (ev) => {
        if (!alive) return;
        const code = ev.error ?? "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone permission is needed for voice start / stop.");
          setListening(false);
          alive = false;
          return;
        }
        // no-speech / aborted / network — quiet restart, no UI flicker
      };
      rec.onend = () => {
        if (!alive) return;
        lastHeardRef.current = "";
        scheduleRestart();
      };
      try {
        rec.start();
        setListening(true);
        setError(null);
      } catch {
        setError("Could not start voice listening.");
        setListening(false);
      }
    };

    build();

    return () => {
      alive = false;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      setListening(false);
    };
  }, [enabled]);

  return { listening, supported, error };
}
