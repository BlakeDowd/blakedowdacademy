"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
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

const START_RE = /\b(start|begin|go)\b/i;
const STOP_RE = /\b(stop|end|finish|pause)\b/i;

/**
 * Listens for spoken "start" / "stop" (and a few aliases) to drive a timer.
 * No transcription is stored — commands only.
 */
export function useVoiceTimerCommands({
  enabled,
  onStart,
  onStop,
}: {
  enabled: boolean;
  onStart: () => void;
  onStop: () => void;
}): { listening: boolean; supported: boolean; error: string | null } {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && getSpeechRecognition() != null;
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);
  const lastCmdAt = useRef(0);

  useEffect(() => {
    onStartRef.current = onStart;
    onStopRef.current = onStop;
  }, [onStart, onStop]);

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
      if (now - lastCmdAt.current < 900) return;
      lastCmdAt.current = now;
      if (kind === "start") onStartRef.current();
      else onStopRef.current();
    };

    const attach = () => {
      if (!alive) return;
      rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-AU";
      rec.onresult = (ev) => {
        let text = "";
        for (let i = 0; i < ev.results.length; i++) {
          text += ` ${ev.results[i][0]?.transcript ?? ""}`;
        }
        if (STOP_RE.test(text)) fire("stop");
        else if (START_RE.test(text)) fire("start");
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
        // "no-speech" / "aborted" are normal — we restart below.
      };
      rec.onend = () => {
        if (!alive) return;
        setListening(false);
        restartTimer = setTimeout(() => {
          if (!alive) return;
          try {
            attach();
            rec?.start();
            setListening(true);
          } catch {
            /* ignore rapid restart races */
          }
        }, 250);
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

    attach();

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
