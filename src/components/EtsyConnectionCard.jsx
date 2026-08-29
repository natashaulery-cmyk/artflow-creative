import React, { useEffect, useState } from "react";
import { Link2, RefreshCw, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function EtsyConnectionCard() {
  const [status, setStatus] = useState({ configured: false, connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("etsyConnectionStatus", {});
      setStatus(res?.data || { configured: false, connected: false });
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/etsy/callback`;
      const res = await base44.functions.invoke("startEtsyOAuth", { redirect_uri: redirectUri });
      const data = res?.data || {};
      if (data.needs_setup || !data.authorize_url) {
        toast.error(data.message || "Etsy credentials still need to be added to Base44.");
        return;
      }
      window.location.assign(data.authorize_url);
    } catch (e) {
      toast.error("Could not start Etsy connection", { description: e?.response?.data?.error || e?.message });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-lg">Etsy</h2>
          <p className="text-sm text-muted-foreground mt-1">Connect Etsy directly so orders sync without relying on sales emails.</p>
        </div>
        {status.connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Link2 className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />}
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : status.connected ? (
        <div className="rounded-2xl bg-muted px-4 py-3">
          <p className="text-sm font-semibold">Connected</p>
          <p className="text-xs text-muted-foreground mt-0.5">{status.shop_name || "Etsy shop"}</p>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {status.configured ? "Connect Etsy" : "Finish Etsy Setup"}
        </button>
      )}
    </section>
  );
}