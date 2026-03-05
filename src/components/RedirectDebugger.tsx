"use client";

import { useEffect } from "react";

export default function RedirectDebugger() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalPush = window.history.pushState;
    window.history.pushState = function (state: unknown, title: string, url?: string | URL | null) {
      if (url === "/" || url === "/home" || String(url) === "/" || String(url) === "/home") {
        alert("STOP! A redirect to Home was triggered. Check the console or look for router.push('/')");
        console.trace("Redirect Trace:");
      }
      return originalPush.call(this, state, title, url);
    };
  }, []);
  return null;
}
