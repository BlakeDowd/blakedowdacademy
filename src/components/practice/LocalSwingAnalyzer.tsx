"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Upload } from "lucide-react";
import { SwingAnalyzer, type AnalyzerSource } from "@/components/video/SwingAnalyzer";
import { trackToolUse } from "@/lib/appUsage";

/**
 * Swing analyser for any player: pick a video from the phone/computer and draw over it.
 * Drawings stay on-device for this session (use coaching videos to save shared layers).
 */
export default function LocalSwingAnalyzer({ compact }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<AnalyzerSource | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const onPick = (file: File | null) => {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setSource({ url, type: "mp4" });
    setFileName(file.name);
    setOpen(true);
    trackToolUse("swing-analyzer");
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
        <p className="text-sm font-semibold text-stone-900">Analyse any swing video</p>
        <p className="mt-1 text-xs text-stone-500">
          Draw lines, angles and circles. Scrub, slow-mo, zoom, flip, and hit Record for a free
          voiceover download (stays on your device). Open a coaching video to save shared drawings.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Choose video
        </button>
        {fileName && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white"
          >
            <Film className="h-4 w-4" aria-hidden />
            Reopen {fileName}
          </button>
        )}
      </div>

      {open && source && (
        <SwingAnalyzer
          source={source}
          canSave={false}
          onClose={() => setOpen(false)}
          title="Swing analyser"
        />
      )}
    </div>
  );
}
