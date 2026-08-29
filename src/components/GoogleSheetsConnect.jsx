import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

const extractId = (url) => {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : (url || "").trim();
};

export default function GoogleSheetsConnect() {
  const [sheetId, setSheetId] = useState("");
  const [sheetInput, setSheetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try {
          const me = await base44.auth.me();
          setSheetId(me?.spreadsheet_id || me?.data?.spreadsheet_id || "");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
  }, []);

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
          <p className="text-sm text-muted-foreground">Link your spreadsheet by URL</p>
        </div>
        {loading ? (
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        ) : sheetId ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="w-4 h-4" /> Set
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">Not set</span>
        )}
      </div>

      <div>
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
          Used to import your orders and export expenses.
        </p>
      </div>
    </section>
  );
}