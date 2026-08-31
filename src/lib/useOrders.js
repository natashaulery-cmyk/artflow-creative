import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

export function useOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastTrackerSync = useRef(0);
  const trackerSyncInFlight = useRef(false);

  const reload = useCallback(async ({ syncTracker = false } = {}) => {
    try {
      const now = Date.now();
      const shouldSyncTracker = syncTracker && !trackerSyncInFlight.current && now - lastTrackerSync.current >= 45 * 1000;
      if (shouldSyncTracker) {
        trackerSyncInFlight.current = true;
        try {
          const response = await fetch("/api/tracker-sync", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
          // 401 means this is a legacy Base44 session; 409 means Google/Tracker
          // is not connected yet. Both are non-blocking for the order screen.
          if (response.ok) lastTrackerSync.current = Date.now();
        } catch {
          // Keep existing Base44/Neon data visible if Google is temporarily unavailable.
        } finally {
          trackerSyncInFlight.current = false;
        }
      }

      const [baseResult, neonResult] = await Promise.allSettled([
        base44.functions.invoke("getBusinessOrders", {}),
        fetch("/api/neon-data?op=orders", { credentials: "include", cache: "no-store" })
          .then(async (res) => {
            if (!res.ok) throw new Error(`Neon orders ${res.status}`);
            return res.json();
          }),
      ]);

      const basePayload = baseResult.status === "fulfilled"
        ? (baseResult.value?.data || baseResult.value || {})
        : {};
      const baseOrders = Array.isArray(basePayload.orders) ? basePayload.orders : [];
      const neonOrders = neonResult.status === "fulfilled" && Array.isArray(neonResult.value?.orders)
        ? neonResult.value.orders
        : [];

      const merged = new Map();
      const identity = (order) => {
        if (order?.id) return `id:${order.id}`;
        if (order?.source_email_id) return `source:${order.source_email_id}`;
        return `order:${order?.platform || ""}:${order?.order_id || ""}:${order?.sale_date || ""}`;
      };

      for (const order of baseOrders) merged.set(identity(order), order);
      for (const order of neonOrders) {
        const key = identity(order);
        merged.set(key, { ...(merged.get(key) || {}), ...order });
      }
      setRecords(Array.from(merged.values()).filter((r) => r?.archived !== true));
    } catch (e) {
      console.error("Failed to load business orders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload({ syncTracker: true });
    const onSynced = () => reload({ syncTracker: true });
    const onFocus = () => reload({ syncTracker: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") reload({ syncTracker: true });
    };
    // Scheduled imports run on the server even when this tab did not initiate
    // them, so lightly poll while visible to surface new orders within seconds.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload({ syncTracker: true });
    }, 15 * 1000);
    window.addEventListener("artflow:data-synced", onSynced);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("artflow:data-synced", onSynced);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return { records, loading, reload };
}
