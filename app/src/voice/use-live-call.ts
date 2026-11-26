"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createLiveCall,
  type CallDeps,
  type CallSnapshot,
  type EndReason,
  type LiveCallController,
  type ThreadEvent,
  type ThreadMessage,
} from "./live-call";
import { createBrowserCallDeps } from "./mock-call";

export type { ThreadEvent };

export type LiveCall = CallSnapshot & {
  readonly start: (history: readonly ThreadMessage[]) => Promise<void>;
  readonly setMuted: (muted: boolean) => void;
  readonly end: (reason?: EndReason) => void;
};

export function useLiveCall(
  onThreadEvent: (event: ThreadEvent) => void,
  deps?: CallDeps,
): LiveCall {
  const latest = useRef(onThreadEvent);
  latest.current = onThreadEvent;
  const ref = useRef<LiveCallController>(undefined);
  ref.current ??= createLiveCall({
    ...(deps ?? createBrowserCallDeps()),
    onThreadEvent: (event) => latest.current(event),
  });
  const controller = ref.current;
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === "hidden") controller.handlePageHidden();
    };
    const onExit = (): void => controller.handlePageExit();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onExit);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onExit);
    };
  }, [controller]);

  return {
    ...snapshot,
    start: controller.start,
    setMuted: controller.setMuted,
    end: (reason = "hang-up") => controller.end(reason),
  };
}
