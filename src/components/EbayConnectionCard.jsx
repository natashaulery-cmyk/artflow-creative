import React, { useEffect, useState } from "react";
import { Link2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function EbayConnectionCard() {
  const [status, setStatus] = useState({ configured: false, connected: false, notifications_connected: false });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("ebayConnectionStatus", {});
      setStatus(res?.data || {});
    } catch {
      setStatus({ configured: false, connected: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setWorking(true);
    try {
      const res = await base44.functions.invoke("startEbayOAuth", {});
      const data = res?.data || {};
      if (data.needs_setup || !data.authorize_url) {
        toast.error(data.message || "eBay developer credentials still need to be configured.");
        return;
      }
      window.location.assign(data.authorize_url);
    } catch (e) {
      toast.error("Could not start eBay connection", { description: e?.response?.data?.error || e?.message });
      setWorking(false);
    }
  };

  const sync = async () => {
    setWorking(true);
    try {
      const setup = await base44.functions.invoke("setupEbayNotifications", {}).catch(() => null);
      let res = await base44.functions.invoke("syncEbay", {});
      let data = res?.data || {};
      let pass = 0;
      while (data.more_possible && pass < 12) {
        res = await base44.functions.invoke("syncEbay", {});
        data = res?.data || {};
        pass += 1;
      }
      const setupData = setup?.data || {};
      toast.success(setupData.message || data.message || "eBay synced");
      await load();
    } catch (e) {
      toast.error("eBay sync needs attention", { description: e?.response?.data?.error || e?.message });
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-lg">eBay</h2>
          <p className="text-sm text-muted-foreground mt-1">Direct paid-order notifications plus Fulfillment API reconciliation.</p>
        </div>
        {status.connected && status.notifications_connected ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : status.last_error ? (
          <AlertCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
        ) : <Link2 className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />}
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : status.connected ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-sm font-semibold">{status.username || "eBay account"} connected</p>
            <p className="text-xs text-muted-foreground mt-1">
              {status.notifications_connected ? "Live order notifications enabled." : "Account connected; live notification setup still needs attention."}
            </p>
          </div>
          <button onClick={sync} disabled={working} className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${working ? "animate-spin" : ""}`} />
            {working ? "Checking eBay…" : "Check & Sync eBay"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button onClick={connect} disabled={working || !status.configured} className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {working ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {status.configured ? "Connect eBay" : "Finish eBay Setup"}
          </button>
          {!status.configured && <p className="text-xs text-muted-foreground text-center">eBay developer credentials and redirect URI must be configured before sellers can connect.</p>}
        </div>
      )}
    </section>
  );
}
