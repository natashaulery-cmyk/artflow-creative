import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { GOOGLE_SHEETS_CONNECTOR_ID } from "@/lib/connectors";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";

const extractId = (url) => {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(url || "").trim();
};

export default function GoogleSheetsConnect() {
  const [connected, setConnected] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      const [me, status] = await Promise.all([
        base44.auth.me(),
        base44.functions.invoke("checkSheetsConnection", {}),
      ]);
      setSheetId(me?.spreadsheet_id || me?.data?.spreadsheet_id || "");
      setConnected(!!status.data?.connected);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await refresh();
      else setChecking(false);
    });
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUrl = await base44.connectors.connectAppUser(
        GOOGLE_SHEETS_CONNECTOR_ID
      );
      // A full-page redirect is more reliable than a popup on iPhone/Safari.
      window.location.href = redirectUrl;
    } catch (e) {
      setConnecting(false);
      toast.error("Could not start Google Sheets connection", {
        description: e?.message,
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(GOOGLE_SHEETS_CONNECTOR_ID);
      setConnected(false);
      toast.success("Google Sheets disconnected");
    } catch {
      toast.error("Could not disconnect Google Sheets");
    }
  };

  const saveSheet = async () => {
    const id = extractId(sheetInput);
    if (!id) {
      toast.error("Paste a valid Google Sheets URL");
      return;
    }
    if (!connected) {
      toast.error("Connect your Google account first");
      return;
    }

    setSaving(true);
    try {
      await base44.auth.updateMe({ spreadsheet_id: id });
      setSheetId(id);
      setSheetInput("");
      toast.success("Spreadsheet saved to your account");
    } catch {
      toast.error("Could not save spreadsheet");
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (!connected || !sheetId) return;
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("reconcileFromSheets", {});
      const totals = res.data?.totals;
      toast.success(
        totals
          ? `Synced ${res.data?.orders || 0} rows — $${Number(totals.sales || 0).toFixed(2)} sales`
          : "Spreadsheet synced"
      );
    } catch (e) {
      toast.error("Spreadsheet sync failed", {
        description: e?.response?.data?.error || e?.message,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-heading text-lg">Google Sheets</h2>
          <p className="text-sm text-muted-foreground">Connect your own Google account</p>
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
        <>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {connecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            {connecting ? "Opening Google…" : "Connect Google Sheets"}
          </button>
          <p className="text-[11px] text-muted-foreground mt-3">
            Your Google connection and spreadsheet are private to your Art Flow Creative account.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
              Your spreadsheet URL
            </label>
            <input
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              placeholder={
                sheetId ? `Current: ${sheetId.slice(0, 14)}…` : "Paste your Google Sheets URL"
              }
              className="form-input mt-1.5 h-12"
            />
            <button
              onClick={saveSheet}
              disabled={saving || !sheetInput.trim()}
              className="w-full h-11 mt-2 rounded-2xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save spreadsheet"}
            </button>
          </div>

          {sheetId && (
            <button
              onClick={syncNow}
              disabled={syncing}
              className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync spreadsheet now"}
            </button>
          )}

          <button
            onClick={handleDisconnect}
            className="w-full h-10 rounded-2xl text-sm text-muted-foreground font-medium"
          >
            Disconnect Google account
          </button>

          <p className="text-[11px] text-muted-foreground">
            Only your signed-in account can access or sync this spreadsheet.
          </p>
        </div>
      )}
    </section>
  );
}
