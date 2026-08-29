import React, { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function VintedConnectionCard() {
  const [status, setStatus] = useState("unknown");
  const [message, setMessage] = useState("Vinted sales are included in Sync All Sales Now.");
  const [syncing, setSyncing] = useState(false);

  const syncVinted = async () => {
    setSyncing(true);
    try {
      let res = await base44.functions.invoke("syncVintedPro", {});
      let data = res?.data || {};
      let pass = 0;
      while (data.more_possible && pass < 12) {
        res = await base44.functions.invoke("syncVintedPro", {});
        data = res?.data || {};
        pass += 1;
      }

      if (data.available === false || data.needs_setup) {
        setStatus("setup");
        setMessage("Direct Vinted Pro API access is not connected yet. Vinted email sales will still sync through the Gmail fallback.");
        toast.info("Vinted email sync is still active");
        return;
      }

      if (data.error) {
        setStatus("error");
        setMessage(data.error);
        toast.error("Vinted sync needs attention", { description: data.error });
        return;
      }

      setStatus("connected");
      setMessage(data.message || "Vinted Pro is connected and up to date.");
      toast.success(data.message || "Vinted synced");
    } catch (error) {
      const text = error?.response?.data?.error || error?.message || "Vinted sync failed";
      setStatus("error");
      setMessage(text);
      toast.error("Vinted sync failed", { description: text });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-lg">Vinted</h2>
          <p className="text-sm text-muted-foreground mt-1">Import Vinted orders into Art Flow Creative.</p>
        </div>
        {status === "connected" ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : status === "error" ? (
          <AlertCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
        ) : null}
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 mb-4">
        <p className="text-sm text-foreground">{message}</p>
        {status === "setup" && (
          <p className="text-xs text-muted-foreground mt-2">
            Direct Vinted access requires an allowlisted Vinted Pro Integrations account. No secret keys should be pasted into chat.
          </p>
        )}
      </div>

      <button
        onClick={syncVinted}
        disabled={syncing}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Checking Vinted…" : "Check & Sync Vinted"}
      </button>
    </section>
  );
}
