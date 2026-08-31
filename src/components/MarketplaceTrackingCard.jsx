import React, { useEffect, useState } from "react";
import { Check, Store } from "lucide-react";
import { useMarketplacePreferences } from "@/lib/useMarketplacePreferences";
import { toast } from "sonner";

const SITE_HELP = {
  Vinted: "Track Vinted sale emails and captured orders",
  Depop: "Track Depop sale emails and captured orders",
  Etsy: "Track Etsy seller orders",
  eBay: "Track eBay seller orders",
};

export default function MarketplaceTrackingCard() {
  const { selected, configured, loading, save, supported } = useMarketplacePreferences();
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(selected);
  }, [selected.join("|")]);

  const toggle = (name) => {
    setDraft((current) => current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name]);
  };

  const saveChoices = async () => {
    setSaving(true);
    try {
      await save(draft);
      toast.success(draft.length
        ? `Tracking ${draft.length} marketplace${draft.length === 1 ? "" : "s"}`
        : "Marketplace tracking is turned off");
    } catch (error) {
      toast.error("Could not save marketplace choices", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const changed = [...draft].sort().join("|") !== [...selected].sort().join("|");

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-blue flex items-center justify-center shrink-0">
          <Store className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-heading text-lg">Sites I sell on</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose only the marketplaces you want Art Flow to track. You can change this anytime.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n) => <div key={n} className="h-12 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {supported.map((name) => {
            const active = draft.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className={`min-h-16 rounded-2xl border p-3 text-left transition-colors ${
                  active
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                    : "border-[hsl(var(--border))] bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">{name}</span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${active ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "bg-background"}`}>
                    {active && <Check className="w-4 h-4" />}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{SITE_HELP[name]}</p>
              </button>
            );
          })}
        </div>
      )}

      {!loading && !configured && (
        <p className="text-xs text-muted-foreground rounded-2xl bg-muted/60 p-3">
          No sites are selected yet. Choose the marketplaces you use to start tracking them.
        </p>
      )}

      {!loading && (changed || !configured) && (
        <button
          type="button"
          onClick={saveChoices}
          disabled={saving}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Marketplace Choices"}
        </button>
      )}
    </section>
  );
}
