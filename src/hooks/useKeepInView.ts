"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

const OWN_TAP_WINDOW_MS = 3000;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * When a tap shrinks the content around it, the scroll position stays put and the panel the
 * user was looking at can end up above the screen. Bring its top back into view if so.
 */
export function keepElementInView(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) return;
  // Wait two frames so follow-up renders (e.g. a sibling accordion closing) have settled.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const scroller = scrollParentOf(el);
      const viewportTop = scroller ? scroller.getBoundingClientRect().top : 0;
      if (el.getBoundingClientRect().top >= viewportTop) return;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }),
  );
}

/** Runs `keepElementInView` on the ref after `dep` changes (not on first render). */
export function useKeepInViewOnChange(ref: RefObject<Element | null>, dep: unknown) {
  const isFirst = useRef(true);
  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    keepElementInView(ref.current);
  }, [dep, ref]);
}

/**
 * Like `useKeepInViewOnChange`, but only when the change follows a tap inside this element —
 * so an accordion item collapsing because a sibling opened doesn't pull the page to itself.
 */
export function useKeepInViewAfterOwnTap<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const lastTapAt = useRef(0);
  const isFirst = useRef(true);

  useLayoutEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (Date.now() - lastTapAt.current > OWN_TAP_WINDOW_MS) return;
    keepElementInView(ref.current);
  }, [dep]);

  const markTap = useCallback(() => {
    lastTapAt.current = Date.now();
  }, []);

  return { ref, onPointerDownCapture: markTap, onKeyDownCapture: markTap };
}
