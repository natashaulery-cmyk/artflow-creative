import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Link2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";

const FLUF_DEVELOPERS_URL = "https://fluf.io/connect/developers";

export default function FlufConnectionCard() {
  const [status, setStatus] = useState({ connected: false, loading: true });
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/fluf?op=status", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        setStatus({ connected: false, loading: false, needsNewLogin: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check FLUF connection");
      setStatus({ ...data, loading: false });
    } catch (error) {
      setStatus({ connected: false, loading: false, error: error?.message || "Could not check FLUF connection" });
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const connect = async () => {
    const trimmed = token.trim();
    if (!trimmed.startsWith("fluf_pat_")) {
      toast.error("Paste your FLUF API token", { description: "The token should start with fluf_pat_." });
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/fluf?op=connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "FLUF connection failed");
      setToken("");
      setShowToken(false);
      toast.success("FLUF connected");
      await loadStatus();
    } catch (error) {
      toast.error("Could not connect FLUF", { description: error?.message });
    } finally {
      setConnecting(false);
    }
  };

  const sync = async (reset = false) => {
    setSyncing(true);
    try {
      let totalNew = 0;
      let totalSeen = 0;
      let more = true;
      let pass = 0;
      while (more && pass < 12) {
        const res = await fetch("/api/fluf?op=sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: reset && pass === 0 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "FLUF sync failed");
        totalNew += Number(data.imported || 0);
        totalSeen += Number(data.seen || 0);
        more = Boolean(data.more_possible);
        pass += 1;
      }
      window.dispatchEvent(new CustomEvent("artflow:data-synced"));
      toast.success(`FLUF synced${totalNew ? ` — ${totalNew} new order${totalNew === 1 ? "" : "s"}` : ""}`);
      setStatus((prev) => ({ ...prev, last_sync_at: new Date().toISOString(), last_order_count: totalSeen }));
    } catch (error) {
      toast.error("FLUF sync failed", { description: error?.message });
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/fluf?op=disconnect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disconnect FLUF");
      toast.success("FLUF disconnected");
      await loadStatus();
    } catch (error) {
      toast.error("Could not disconnect FLUF", { description: error?.message });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5" /> FLUF Connect
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pull sales from the marketplaces you already connect inside FLUF.
          </p>
        </div>
        {status.connected ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />
        )}
      </div>

      {status.loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /> Checking FLUF…
        </div>
      ) : status.needsNewLogin ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
          Sign in with the new Art Flow account login first, then return here to connect FLUF.
        </div>
      ) : status.connected ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4">
            <p className="text-sm font-semibold">Connected</p>
            <p className="text-xs text-muted-foreground mt-1">
              {status.last_sync_at
                ? `Last synced ${new Date(status.last_sync_at).toLocaleString()}`
                : "Ready for the first sales sync."}
            </p>
            {status.last_error ? <p className="text-xs text-destructive mt-2">{status.last_error}</p> : null}
          </div>
          <button
            onClick={() => sync(false)}
            disabled={syncing}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing FLUF sales…" : "Sync FLUF Sales Now"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={FLUF_DEVELOPERS_URL}
              target="_blank"
              rel="noreferrer"
              className="h-11 rounded-2xl bg-muted font-semibold text-sm flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" /> FLUF Developers
            </a>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="h-11 rounded-2xl bg-muted font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Unplug className="w-4 h-4" /> {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground leading-6">
            <p className="font-semibold text-foreground mb-1">One-time setup</p>
            <p>1. Connect Vinted, Depop, eBay, Etsy and your other marketplaces inside FLUF.</p>
            <p>2. Open FLUF Developers and create an API token.</p>
            <p>3. Paste that token below. Art Flow encrypts it before saving.</p>
          </div>
          <a
            href={FLUF_DEVELOPERS_URL}
            target="_blank"
            rel="noreferrer"
            className="w-full h-11 rounded-2xl bg-muted font-semibold text-sm flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open FLUF Developers
          </a>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="fluf_pat_…"
              className="form-input pr-12"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <button
            onClick={connect}
            disabled={connecting || !token.trim()}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {connecting ? "Connecting FLUF…" : "Connect FLUF"}
          </button>
          {status.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
        </div>
      )}
    </section>
  );
}
