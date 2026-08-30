import React, { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function DepopConnectionCard() {
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("Depop sales are included in Sync All Sales Now.");
  const [syncing, setSyncing] = useState(false);

  const syncDepop = async () => {
    setSyncing(true);
    try {
      let res = await base44.functions.invoke("syncDepopPartner", {});
      let data = res?.data || {};
      let pass = 0;
      while (data.more_possible && pass < 12) {
        res = await base44.functions.invoke("syncDepopPartner", {});
        data = res?.data || {};
        pass += 1;
      }

      if (data.available === false || data.needs_setup) {
        setStatus("setup");
        setMessage(data.message || "Direct Depop Partner API access is not connected yet. Depop email sales can still sync from a connected inbox.");
        toast.info("Depop email sync is still available");
        return;
      }
      if (data.error) throw new Error(data.error);

      const hook = await base44.functions.invoke("setupDepopWebhook", {}).catch(() => null);
      const hookData = hook?.data || {};
      setStatus(hookData.connected ? "connected" : "setup");
      setMessage(hookData.message || data.message || "Depop is up to date.");
      toast.success(hookData.message || data.message || "Depop synced");
    } catch (error) {
      const text = error?.response?.data?.error || error?.message || "Depop sync failed";
      setStatus("error");
      setMessage(text);
      toast.error("Depop sync needs attention", { description: text });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-lg">Depop</h2>
          <p className="text-sm text-muted-foreground mt-1">Direct orders plus live order/refund webhooks when Partner API access is available.</p>
        </div>
        {status === "connected" ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : status === "error" ? (
          <AlertCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
        ) : null}
      </div>
      <div className="rounded-2xl bg-muted/60 p-3 mb-4">
        <p className="text-sm text-foreground">{message}</p>
      </div>
      <button
        onClick={syncDepop}
        disabled={syncing}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Checking Depop…" : "Check & Sync Depop"}
      </button>
    </section>
  );
}
