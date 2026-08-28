import React from "react";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// Drop-in gesture: place <PullToRefresh onRefresh={refresh} /> at the top of
// any page that renders a dynamic list. Attaches to the window and shows a
// small spinner when the user pulls down from the top.
export default function PullToRefresh({ onRefresh }) {
  const { refreshing, pull } = usePullToRefresh(onRefresh);
  const visible = pull > 0 || refreshing;
  if (!visible) return null;
  const distance = refreshing ? 36 : pull;
  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
      style={{ height: distance }}
    >
      <RefreshCw
        className={`w-5 h-5 text-muted-foreground ${refreshing ? "animate-spin" : ""}`}
        style={{ transform: `rotate(${pull * 3}deg)` }}
      />
    </div>
  );
}