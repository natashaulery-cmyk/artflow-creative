import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export function useOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getBusinessOrders", {});
      const payload = res?.data || res || {};
      setRecords(Array.isArray(payload.orders) ? payload.orders : []);
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
    window.addEventListener("artflow:data-synced", onSynced);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("artflow:data-synced", onSynced);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return { records, loading, reload };
}
