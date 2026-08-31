import React, { useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useEntity } from "@/lib/useBusinessData";
import { toast } from "sonner";

const randomKey = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `af_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

export default function BrowserSyncCard() {
  const { user } = useAuth();
  const { records: businesses, loading, reload } = useEntity("Business", "-updated_date", 200);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const business = useMemo(() => {
    const activeId = user?.active_business_id || user?.data?.active_business_id;
    const email = String(user?.email || "").toLowerCase();
    return businesses.find((item) => item.id === activeId)
      || businesses.find((item) => (item.member_emails || []).some((value) => String(value).toLowerCase() === email));
  }, [businesses, user]);

  if (loading || !business) return null;

  const key = String(business.extension_sync_key || "");
  const enabled = business.extension_sync_enabled !== false && !!key;

  const createKey = async () => {
    setSaving(true);
    try {
      const nextKey = randomKey();
      await base44.entities.Business.update(business.id, {
        extension_sync_key: nextKey,
        extension_sync_enabled: true,
      });
      await reload();
      setShowKey(true);
      toast.success("Browser Sync key created");
    } catch (error) {
      toast.error("Could not create Browser Sync key", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      await base44.entities.Business.update(business.id, {
        extension_sync_enabled: !enabled,
      });
      await reload();
      toast.success(enabled ? "Browser Sync paused" : "Browser Sync enabled");
    } catch (error) {
      toast.error("Could not update Browser Sync", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Browser Sync key copied");
    } catch {
      toast.error("Could not copy the key");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">Art Flow Browser Sync</h2>
            {enabled && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Capture Vinted and Depop order details from Chrome without sharing marketplace passwords, cookies, or login tokens.
          </p>
        </div>
      </div>

      {!key ? (
        <button
          onClick={createKey}
          disabled={saving}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <KeyRound className="w-4 h-4" />
          {saving ? "Creating…" : "Create Browser Sync Key"}
        </button>
      ) : (
        <>
          <div className="rounded-2xl bg-muted p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Private sync key</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 text-xs break-all bg-background rounded-xl px-3 py-2 border border-[hsl(var(--border))]">
                {showKey ? key : `${key.slice(0, 7)}••••••••••••••••••••${key.slice(-6)}`}
              </code>
              <button onClick={() => setShowKey((value) => !value)} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label={showKey ? "Hide sync key" : "Show sync key"}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={copyKey} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label="Copy sync key">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <a
            href="/downloads/artflow-browser-sync.zip"
            download
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Download Chrome Extension
          </a>

          <button
            onClick={toggleEnabled}
            disabled={saving}
            className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
            {enabled ? "Pause Browser Sync" : "Enable Browser Sync"}
          </button>
        </>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>1. Download and unzip the extension.</p>
        <p>2. In Chrome open Extensions → Manage Extensions → Developer mode → Load unpacked.</p>
        <p>3. Open the Art Flow extension, paste this key once, then use it on a Vinted or Depop sold/order page.</p>
        <p>Captured orders go to the ArtFlow Creative Tracker and then into the app.</p>
      </div>
    </section>
  );
}
