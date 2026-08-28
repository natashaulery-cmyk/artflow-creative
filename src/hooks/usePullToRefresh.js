import { useEffect, useRef, useState } from "react";

// Basic pull-to-refresh: attach to the window so any page that scrolls
// the body (the app's natural layout) gets the gesture for free.
// Calls onRefresh when the user drags down from the top past the threshold.
export function usePullToRefresh(onRefresh, threshold = 60) {
  const [refreshing, setRefreshing] = useState(false);
  const [pull, setPull] = useState(0);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const refreshFn = useRef(onRefresh);

  useEffect(() => {
    refreshFn.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const onStart = (e) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        pullRef.current = Math.min(dy, 80);
        setPull(pullRef.current);
      }
    };
    const onEnd = async () => {
      if (pullRef.current > threshold && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await refreshFn.current?.();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      }
      pullRef.current = 0;
      setPull(0);
      startY.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [threshold]);

  return { refreshing, pull };
}