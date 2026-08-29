import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Loads an entity's records and keeps them in sync via real-time subscriptions.
export function useEntity(entityName, sort = "-created_date", limit = 1000) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const entity = base44.entities[entityName];

  const reload = useCallback(async () => {
    try {
      const data = await entity.list(sort, limit);
      // Archived rows are retained only as a rollback/safety copy and must
      // never affect dashboards, reports, taxes, inventory, or order totals.
      setRecords(data.filter((r) => r?.archived !== true));
    } catch (e) {
      console.error(`Failed to load ${entityName}:`, e);
    } finally {
      setLoading(false);
    }
  }, [entity, sort, limit]);

  useEffect(() => {
    let unsub;
    reload();
    const onSynced = () => reload();
    window.addEventListener("artflow:data-synced", onSynced);
    if (typeof entity.subscribe === "function") {
      unsub = entity.subscribe((event) => {
        setRecords((prev) => {
          if (event.type === "create") {
            return event.data?.archived === true ? prev : [event.data, ...prev];
          }
          if (event.type === "update") {
            if (event.data?.archived === true) {
              return prev.filter((r) => r.id !== event.data.id);
            }
            return prev.map((r) => (r.id === event.data.id ? event.data : r));
          }
          if (event.type === "delete") return prev.filter((r) => r.id !== event.data.id);
          return prev;
        });
      });
    }
    return () => {
      window.removeEventListener("artflow:data-synced", onSynced);
      if (unsub) unsub();
    };
  }, [entityName]);

  return { records, loading, reload };
}

const RATE_KEY = "aac_tax_reserve_rate";

export function useTaxRate() {
  const [rate, setRate] = useState(() => {
    const v = Number(localStorage.getItem(RATE_KEY));
    return v > 0 && v <= 100 ? v : 30;
  });

  const update = useCallback((newRate) => {
    const v = Math.max(0, Math.min(100, Number(newRate) || 0));
    setRate(v);
    localStorage.setItem(RATE_KEY, String(v));
  }, []);

  return [rate, update];
}