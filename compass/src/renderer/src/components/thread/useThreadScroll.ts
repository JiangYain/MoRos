import type { DependencyInstallProgress, UiApprovalRequest, UiThreadItem } from "@shared/types";
import { useLayoutEffect, useRef, useState } from "react";
import { shouldStickToLatest } from "../thread-scroll";

interface ThreadScrollInput {
  approvals: UiApprovalRequest[];
  needsTarget: boolean;
  sessionId?: string;
  thread: UiThreadItem[];
  visibleTargetInstall?: DependencyInstallProgress;
}

interface ThreadScrollController {
  jumpToLatest(): void;
  onScroll(): void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showJumpToLatest: boolean;
}

export function useThreadScroll({
  approvals,
  needsTarget,
  sessionId,
  thread,
  visibleTargetInstall,
}: ThreadScrollInput): ThreadScrollController {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const scrollViewportHeightRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useLayoutEffect(() => {
    stickRef.current = true;
    setShowJumpToLatest(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && stickRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [approvals, needsTarget, thread, visibleTargetInstall]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    let previousHeight = node.clientHeight;
    scrollViewportHeightRef.current = previousHeight;
    const observer = new ResizeObserver(() => {
      const nextHeight = node.clientHeight;
      if (nextHeight === previousHeight) return;
      previousHeight = nextHeight;
      scrollViewportHeightRef.current = nextHeight;
      if (stickRef.current) {
        node.scrollTop = node.scrollHeight;
        setShowJumpToLatest(false);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onScroll = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    if (node.clientHeight !== scrollViewportHeightRef.current) {
      scrollViewportHeightRef.current = node.clientHeight;
      if (stickRef.current) {
        node.scrollTop = node.scrollHeight;
        setShowJumpToLatest(false);
      }
      return;
    }
    const stickToLatest = shouldStickToLatest(node);
    stickRef.current = stickToLatest;
    setShowJumpToLatest(!stickToLatest);
  };

  const jumpToLatest = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    stickRef.current = true;
    setShowJumpToLatest(false);
    node.scrollTop = node.scrollHeight;
  };

  return { jumpToLatest, onScroll, scrollRef, showJumpToLatest };
}
