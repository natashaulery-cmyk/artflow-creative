import React, { useEffect, useState } from "react";
import { CheckCircle2, Link2, Mail, RefreshCw, Table2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const extractSheetId = (value = "") => {
  const text = String(value || "").trim();
  const fromUrl = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return fromUrl?.[1] || (/^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : "");
};

export default function EmailConnectionsCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState("");
  const [sheetValue, setSheetValue] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("emailConnectionStatus", {});
      const data = res?.data || {};
      setStatus(data);
      setSheetValue(data?.sheets?.spreadsheet_id || "");
    } catch (e) {
      setStatus({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async (provider, connectorId) => {
    if (!connectorId) {
      toast.info(`${provider} connection is being prepared for per-user access.`);
      return;
    }
    setConnecting(provider);
    try {
      const redirectUrl = await base44.connectors.connectAppUser(connectorId);
      window.location.assign(redirectUrl);
    } catch (e) {
      toast.error(`Could not connect ${provider}`, { description: e?.message });
      setConnecting("");
    }
  };

  const saveSheet = async () => {
    const spreadsheetId = extractSheetId(sheetValue);
    if (!spreadsheetId) {
      toast.error("Paste a valid Google Sheets link or spreadsheet ID.");
      return;
    }
    setSavingSheet(true);
    try {
      await base44.auth.updateMe({ spreadsheet_id: spreadsheetId });
      const res = await base44.functions.invoke("setupSpreadsheetBackup", { spreadsheetId });
      toast.success(res?.data?.message || "Spreadsheet backup is ready");
      setSheetValue(spreadsheetId);
      await load();
    } catch (e) {
      toast.error("Could not set up spreadsheet backup", { description: e?.response?.data?.error || e?.message });
    } finally {
      setSavingSheet(false);
    }
  };

  const providerRow = ({ name, detail, provider, disabledReason }) => {
    const connected = !!provider?.connected || !!provider?.legacy_shared;
    return (
      <div className="rounded-2xl bg-muted/60 p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">{name}</p>
            {connected ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : disabledReason ? <AlertCircle className="w-4 h-4 text-muted-foreground" /> : null}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {provider?.email || (provider?.legacy_shared ? "Current Gmail fallback connected" : detail)}
          </p>
        </div>
        {!connected && !disabledReason && (
          <button
            onClick={() => connect(name, provider?.connector_id)}
            disabled={connecting === name || !provider?.configured}
            className="h-9 px-3 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-semibold disabled:opacity-50"
          >
            {connecting === name ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div>
        <h2 className="font-heading text-lg flex items-center gap-2"><Link2 className="w-5 h-5" /> Email & Spreadsheet Connections</h2>
        <p className="text-sm text-muted-foreground mt-1">Connected inboxes are checked for both sales and business expenses. Google Sheets fills in anything the inbox/API sync misses.</p>
      </div>

      {loading ? (
        <div className="h-28 rounded-2xl bg-muted animate-pulse" />
      ) : (
        <div className="space-y-2">
          {providerRow({ name: "Gmail", detail: status?.gmail?.configured ? "Connect your Gmail inbox" : "Per-user Gmail setup is being prepared", provider: status?.gmail })}
          {providerRow({ name: "Microsoft", detail: status?.outlook?.configured ? "Outlook / Hotmail / Microsoft 365" : "Per-user Microsoft setup is being prepared", provider: status?.outlook })}
          {providerRow({ name: "Yahoo", detail: "Yahoo Mail", provider: status?.yahoo, disabledReason: "Yahoo requires provider mail-access approval" })}
        </div>
      )}

      <div className="border-t border-[hsl(var(--border))] pt-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0"><Table2 className="w-4 h-4" /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Google Sheets backup</p>
            <p className="text-xs text-muted-foreground">Use an Expenses and Deductions tab as the final safety net. ArtFlow only imports rows that are missing.</p>
          </div>
          {status?.sheets?.ready && <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-1" />}
        </div>

        {!status?.sheets?.connected ? (
          <button
            onClick={() => connect("Google Sheets", status?.sheets?.connector_id)}
            disabled={connecting === "Google Sheets"}
            className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold"
          >
            {connecting === "Google Sheets" ? "Connecting…" : "Connect Google Sheets"}
          </button>
        ) : (
          <>
            <input
              value={sheetValue}
              onChange={(e) => setSheetValue(e.target.value)}
              placeholder="Paste Google Sheet link or ID"
              className="form-input"
            />
            <button
              onClick={saveSheet}
              disabled={savingSheet}
              className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${savingSheet ? "animate-spin" : ""}`} />
              {savingSheet ? "Setting up…" : "Set Up Spreadsheet Backup"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
