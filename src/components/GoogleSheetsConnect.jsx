import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { GOOGLE_SHEETS_CONNECTOR_ID } from "@/lib/connectors";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

const extractId = (url) => {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : (url || "").trim();
};

export default function GoogleSheetsConnect() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sheetId, setSheetId] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [saving, setSaving] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const me = await base44.auth.me();
      const id = me?.spreadsheet_id || me?.data?.spreadsheet_id;
      setSheetId(id || "");
      try {
        const res = await base44.functions.invoke("checkSheetsConnection", {});
        setConnected(!!res.data?.connected);
      } catch {
        setConnected(false);
      }
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
      const url = await base44.connectors.connectAppUser(GOOGLE_SHEETS_CONNECTOR_ID);
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
      await base44.connectors.disconnectAppUser(GOOGLE_SHEETS_CONNECTOR_ID);
      setConnected(false);
      toast.success("Disconnected from Google Sheets");
    } catch {
      toast.error("Could not disconnect");
    }
  };

  const saveSheet = async () => {
    const id = extractId(sheetInput);
    if (!id) {
      toast.error("Paste a valid Google Sheets URL");
      return;
    }
    setSaving(true);
    try {
      await base44.auth.updateMe({ spreadsheet_id: id });
      setSheetId(id);
      setSheetInput("");
      toast.success("Spreadsheet saved");
      await check();
    } catch {
      toast.error("Could not save spreadsheet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-heading text-lg">Google Sheets</h2>
          <p className="text-sm text-muted-foreground">Connect your own spreadsheet</p>
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
          <ExternalLink className="w-4 h-4" /> Connect Google Sheets
        </button>
      ) : (
        <button
          onClick={handleDisconnect}
          className="w-full h-11 rounded-2xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform"
        >
          Disconnect
        </button>
      )}

      <div className="mt-4">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase">
          Your spreadsheet URL
        </label>
        <input
          value={sheetInput}
          onChange={(e) => setSheetInput(e.target.value)}
          placeholder={sheetId ? `Current: ${sheetId.slice(0, 14)}…` : "Paste your Google Sheets URL"}
          className="form-input mt-1.5 h-12"
        />
        <button
          onClick={saveSheet}
          disabled={saving || !sheetInput.trim()}
          className="w-full h-11 mt-2 rounded-2xl bg-muted text-foreground font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save spreadsheet"}
        </button>
        <p className="text-[11px] text-muted-foreground mt-2">
          Used to import your orders, sync inventory, and export expenses.
        </p>
      </div>
    </section>
  );
}