"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
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
 * Restarts recognition safely when the browser ends a session.
 */
export function useVoiceTimerCommands({
  enabled,
  running,
  onStart,
  onStop,
  onDenied,
}: {
  enabled: boolean;
  /** When true, only "stop" is accepted; when false, only "start". */
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  /** Called when mic permission is blocked so the UI can flip the toggle off. */
  onDenied?: () => void;
}): { listening: boolean; supported: boolean; error: string | null } {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);
  const onDeniedRef = useRef(onDenied);
  const runningRef = useRef(running);
  const lastCmdAt = useRef(0);

  useEffect(() => {
    setSupported(getSpeechRecognition() != null);
  }, []);

  useEffect(() => {
    onStartRef.current = onStart;
    onStopRef.current = onStop;
    onDeniedRef.current = onDenied;
  }, [onStart, onStop, onDenied]);

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
    let starting = false;
    /** Bumps on every rebuild so stale onend/onerror handlers no-op. */
    let generation = 0;

    const clearRestart = () => {
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
    };

    const fire = (kind: "start" | "stop") => {
      const now = Date.now();
      if (now - lastCmdAt.current < 900) return;
      lastCmdAt.current = now;
      // Sync immediately so a quick opposite command isn't gated on the React tick.
      if (kind === "start") {
        runningRef.current = true;
        onStartRef.current();
      } else {
        runningRef.current = false;
        onStopRef.current();
      }
    };

    const handleUtterance = (raw: string) => {
      const text = raw.trim().toLowerCase();
      if (!text) return;

      const wantsStop = STOP_RE.test(text);
      const wantsStart = START_RE.test(text);
      if (!wantsStop && !wantsStart) return;

      if (runningRef.current) {
        if (wantsStop) fire("stop");
      } else if (wantsStart) {
        fire("start");
      }
    };

    const safeStart = (instance: SpeechRec, gen: number) => {
      if (!alive || gen !== generation || starting) return;
      starting = true;
      try {
        instance.start();
      } catch {
        // Already started or dead — onend will rebuild if needed.
        starting = false;
        setListening(false);
        return;
      }
    };

    const scheduleRestart = (gen: number) => {
      if (!alive || gen !== generation) return;
      clearRestart();
      restartTimer = setTimeout(() => {
        if (!alive || gen !== generation || !rec) return;
        safeStart(rec, gen);
      }, 280);
    };

    const build = () => {
      if (!alive) return;
      clearRestart();
      const gen = ++generation;
      starting = false;

      const prev = rec;
      rec = null;
      if (prev) {
        prev.onresult = null;
        prev.onerror = null;
        prev.onend = null;
        prev.onstart = null;
        try {
          prev.abort();
        } catch {
          /* ignore */
        }
      }

      const next = new Ctor();
      rec = next;
      next.continuous = true;
      next.interimResults = true;
      next.maxAlternatives = 1;
      next.lang = "en-AU";

      next.onstart = () => {
        if (!alive || gen !== generation) return;
        starting = false;
        setListening(true);
        setError(null);
      };

      next.onresult = (ev) => {
        if (!alive || gen !== generation) return;
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const chunk = ev.results[i];
          const transcript = chunk?.[0]?.transcript ?? "";
          if (!transcript.trim()) continue;
          // Final results always; interim only when the phrase clearly matches.
          if (chunk?.isFinal || START_RE.test(transcript) || STOP_RE.test(transcript)) {
            handleUtterance(transcript);
          }
        }
      };

      next.onerror = (ev) => {
        if (!alive || gen !== generation) return;
        starting = false;
        const code = ev.error ?? "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone permission is needed for voice start / stop.");
          setListening(false);
          alive = false;
          clearRestart();
          onDeniedRef.current?.();
          return;
        }
        if (code === "aborted") return;
        // no-speech / network / etc. — Chrome usually fires onend next; restart there.
        if (code === "audio-capture") {
          setError("No microphone found.");
          setListening(false);
          alive = false;
          onDeniedRef.current?.();
        }
      };

      next.onend = () => {
        if (!alive || gen !== generation) return;
        starting = false;
        // Keep showing "listening" while we quietly restart — only drop if rebuild fails.
        scheduleRestart(gen);
      };

      safeStart(next, gen);
    };

    build();

    return () => {
      alive = false;
      clearRestart();
      generation += 1;
      const cur = rec;
      rec = null;
      if (cur) {
        cur.onresult = null;
        cur.onerror = null;
        cur.onend = null;
        cur.onstart = null;
        try {
          cur.abort();
        } catch {
          /* ignore */
        }
      }
      setListening(false);
    };
  }, [enabled]);

  return { listening, supported, error };
}
