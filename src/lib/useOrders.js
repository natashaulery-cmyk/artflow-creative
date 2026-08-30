import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export function useOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
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
    reload();
    const onSynced = () => reload();
    const onFocus = () => reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    // Scheduled imports run on the server even when this tab did not initiate
    // them, so lightly poll while visible to surface new orders within seconds.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 10 * 1000);
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
