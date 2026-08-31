import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export const TRACKABLE_MARKETPLACES = ["Vinted", "Depop", "Etsy", "eBay"];

const normalizeSelection = (items = []) =>
  TRACKABLE_MARKETPLACES.filter((name) => Array.isArray(items) && items.includes(name));

export function useMarketplacePreferences() {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (user.auth_backend === "neon") {
        const response = await fetch("/api/marketplace-preferences", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load marketplace choices");
        setSelected(normalizeSelection(data.selected));
        setConfigured(Boolean(data.configured));
      } else {
        const businesses = await base44.entities.Business.list("name", 100);
        const activeId = user.active_business_id || user.data?.active_business_id || null;
        const email = String(user.email || "").trim().toLowerCase();
        const business = businesses.find((item) => item.id === activeId)
          || businesses.find((item) => (item.member_emails || []).some((member) => String(member).toLowerCase() === email));
        const hasSelection = Array.isArray(business?.tracked_marketplaces);
        setSelected(hasSelection ? normalizeSelection(business.tracked_marketplaces) : []);
        setConfigured(hasSelection);
      }
    } catch (error) {
      console.error("Could not load marketplace preferences", error);
      setSelected([]);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.auth_backend, user?.active_business_id, user?.email]);

  const save = useCallback(async (nextSelection) => {
    const next = normalizeSelection(nextSelection);
    if (!user) return next;

    if (user.auth_backend === "neon") {
      const response = await fetch("/api/marketplace-preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save marketplace choices");
      setSelected(normalizeSelection(data.selected));
    } else {
      const businesses = await base44.entities.Business.list("name", 100);
      const activeId = user.active_business_id || user.data?.active_business_id || null;
      const email = String(user.email || "").trim().toLowerCase();
      const business = businesses.find((item) => item.id === activeId)
        || businesses.find((item) => (item.member_emails || []).some((member) => String(member).toLowerCase() === email));
      if (!business?.id) throw new Error("Business workspace not found");
      await base44.entities.Business.update(business.id, { tracked_marketplaces: next });
      setSelected(next);
    }

    setConfigured(true);
    window.dispatchEvent(new CustomEvent("artflow:marketplaces-changed", { detail: { selected: next } }));
    return next;
  }, [user]);

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener("artflow:marketplaces-changed", onChanged);
    return () => window.removeEventListener("artflow:marketplaces-changed", onChanged);
  }, [load]);

  return { selected, configured, loading, save, reload: load, supported: TRACKABLE_MARKETPLACES };
}
