import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Table2 } from "lucide-react";
import { artflowAuthClient } from "@/lib/artflowAuthClient";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const PENDING_KEY = "artflow_create_tracker_after_google";

export default function TrackerSetupCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadStatus = async () => {
    if (user?.auth_backend !== "neon") {
      setLoading(false);
      return null;
    }
    try {
      const response = await fetch("/api/create-tracker", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not check tracker status");
      setStatus(data);
      return data;
    } catch (error) {
      toast.error("Could not check ArtFlow Tracker", { description: error?.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createTracker = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch("/api/create-tracker", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Could not create tracker");
        error.code = data.code;
        throw error;
      }
      sessionStorage.removeItem(PENDING_KEY);
      setStatus((current) => ({ ...(current || {}), ...data, connected: true, google_connected: true }));
      window.dispatchEvent(new CustomEvent("artflow:tracker-ready", { detail: data }));
      toast.success(data.message || "Your ArtFlow Creative Tracker is ready");
    } catch (error) {
      if (["GOOGLE_NOT_LINKED", "GOOGLE_RECONNECT"].includes(error?.code)) {
        sessionStorage.setItem(PENDING_KEY, "1");
        await connectGoogle();
      } else {
        toast.error("Could not create ArtFlow Tracker", { description: error?.message });
      }
    } finally {
      setCreating(false);
    }
  };

  const connectGoogle = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      sessionStorage.setItem(PENDING_KEY, "1");
      const result = await artflowAuthClient.linkSocial({
        provider: "google",
        callbackURL: `${window.location.origin}/account`,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive.file",
        ],
        additionalParams: {
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent",
        },
      });
      if (result?.error) throw new Error(result.error.message || "Could not connect Google");
      if (result?.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      throw new Error("Google connection did not return a sign-in link.");
    } catch (error) {
      sessionStorage.removeItem(PENDING_KEY);
      toast.error("Could not connect Google Sheets", { description: error?.message });
      setConnecting(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await loadStatus();
      if (!active || !data) return;
      const pending = sessionStorage.getItem(PENDING_KEY) === "1";
      if (pending && data.google_connected && !data.connected) {
        createTracker();
      }
    })();
    return () => { active = false; };
  }, [user?.auth_backend]);

  if (user?.auth_backend !== "neon") return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl pastel-lavender flex items-center justify-center shrink-0">
          <Table2 className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-lg">ArtFlow Creative Tracker</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every Art Flow business uses our standard Google tracker so sales, expenses, inventory, statistics, and taxes stay compatible with the app.
          </p>
        </div>
        {status?.connected && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-1" />}
      </div>

      {loading ? (
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
      ) : status?.connected ? (
        <div className="space-y-2">
          <div className="rounded-2xl bg-muted/60 p-3">
            <p className="text-sm font-semibold">Tracker connected</p>
            <p className="text-xs text-muted-foreground mt-1">Art Flow will write sales and expenses into this tracker first, then sync the app from it.</p>
          </div>
          <button
            type="button"
            onClick={() => status?.spreadsheet_url && window.open(status.spreadsheet_url, "_blank", "noopener,noreferrer")}
            className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open My ArtFlow Tracker
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
            Art Flow creates the tracker in your Google Drive automatically. You do not need to build, copy, or paste a spreadsheet yourself.
          </div>
          <button
            type="button"
            onClick={createTracker}
            disabled={creating || connecting}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${creating || connecting ? "animate-spin" : ""}`} />
            {connecting ? "Connecting Google…" : creating ? "Creating tracker…" : "Create My ArtFlow Tracker"}
          </button>
        </div>
      )}
    </section>
  );
}
