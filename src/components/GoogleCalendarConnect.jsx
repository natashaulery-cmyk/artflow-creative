import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { GOOGLE_CALENDAR_CONNECTOR_ID } from "@/lib/connectors";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

export default function GoogleCalendarConnect() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  const check = async () => {
    setChecking(true);
    try {
      const res = await base44.functions.invoke("checkCalendarConnection", {});
      setConnected(!!res.data?.connected);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await check();
      else setChecking(false);
    });
  }, []);

  const handleConnect = async () => {
    try {
      const url = await base44.connectors.connectAppUser(GOOGLE_CALENDAR_CONNECTOR_ID);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          check();
        }
      }, 500);
    } catch {
      toast.error("Could not start Google connection");
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(GOOGLE_CALENDAR_CONNECTOR_ID);
      setConnected(false);
      toast.success("Disconnected from Google Calendar");
    } catch {
      toast.error("Could not disconnect");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-heading text-lg">Google Calendar</h2>
          <p className="text-sm text-muted-foreground">Sync your scheduled events</p>
        </div>
        {checking ? (
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        ) : connected ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Connected
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">Not connected</span>
        )}
      </div>

      {!connected ? (
        <button
          onClick={handleConnect}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <ExternalLink className="w-4 h-4" /> Connect Google Calendar
        </button>
      ) : (
        <button
          onClick={handleDisconnect}
          className="w-full h-11 rounded-2xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform"
        >
          Disconnect
        </button>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Events you add in the app will appear on your main Google Calendar.
      </p>
    </section>
  );
}