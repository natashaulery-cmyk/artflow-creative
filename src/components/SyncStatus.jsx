import React, { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

const KEY = "artflow_last_sync";

function readState() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export default function SyncStatus({ totalOrders = 0 }) {
  const [state, setState] = useState(readState);

  useEffect(() => {
    const onSync = (event) => setState(event.detail || readState());
    window.addEventListener("artflow:sync-state", onSync);
    return () => window.removeEventListener("artflow:sync-state", onSync);
  }, []);

  const syncing = state?.status === "syncing";
  const when = state?.at
    ? new Date(state.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-card px-4 py-3 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {syncing ? (
          <RefreshCw className="w-4 h-4 animate-spin text-[hsl(var(--primary))] shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--primary))] shrink-0" />
        )}
        <span className="text-muted-foreground truncate">
          {syncing ? "Syncing sales and expenses…" : when ? `Synced ${when}` : "Automatic sync every 5 minutes"}
        </span>
      </div>
      <span className="font-medium text-foreground shrink-0">{totalOrders} orders</span>
    </div>
  );
}
