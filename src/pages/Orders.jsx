import React, { useState, useMemo } from "react";
import { Search, Plus, RefreshCw, Download } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { base44 } from "@/api/base44Client";
import { formatMoney, formatDate, currentMonthKey, monthLabel } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import OrderForm from "@/components/OrderForm";
import { toast } from "sonner";

export default function Orders() {
  const { records: orders } = useEntity("Order", "-sale_date");
  const { records: inventoryCosts } = useEntity("InventoryCost", "size");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncEmails = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("processSaleEmails", {});
      toast.success(`Synced ${res.data?.created || 0} new order(s)`);
    } catch (e) {
      toast.error("Email sync failed — connect Gmail first");
    } finally {
      setSyncing(false);
    }
  };

  const importSheets = async () => {
    const url = window.prompt("Paste your Google Sheets URL:");
    if (!url) return;
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = m ? m[1] : url.trim();
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("importFromSheets", { spreadsheetId });
      toast.success(`Imported ${res.data?.imported || 0} order(s)`);
    } catch (e) {
      toast.error("Import failed — connect Google Sheets first");
    } finally {
      setSyncing(false);
    }
  };

  const months = useMemo(() => {
    const set = new Set(
      orders.map((o) => (o.sale_date || "").slice(0, 7)).filter(Boolean)
    );
    return [...set].sort().reverse();
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (platformFilter !== "All" && o.platform !== platformFilter) return false;
      if ((o.sale_date || "").slice(0, 7) !== monthFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${o.product_name} ${o.order_id || ""}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [orders, platformFilter, monthFilter, search]);

  const summary = useMemo(() => {
    const sales = filtered.reduce((s, o) => s + (o.sale_total || 0), 0);
    const profit = filtered.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    return { sales, profit, count: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-[28px] leading-tight">Orders</h1>
        <p className="text-muted-foreground text-sm">Sold items across platforms</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sales</p>
          <p className="font-heading text-lg mt-1">{formatMoney(summary.sales)}</p>
        </div>
        <div className="pastel-blue rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Orders</p>
          <p className="font-heading text-lg mt-1">{summary.count}</p>
        </div>
        <div className="pastel-mint rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Profit</p>
          <p className="font-heading text-lg mt-1">{formatMoney(summary.profit)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={syncEmails}
          disabled={syncing}
          className="flex-1 h-11 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync Emails
        </button>
        <button
          onClick={importSheets}
          disabled={syncing}
          className="flex-1 h-11 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
        >
          <Download className="w-4 h-4" /> Import Sheets
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or order ID"
          className="form-input pl-11"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {["All", "Vinted", "Depop"].map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              platformFilter === p
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {p}
          </button>
        ))}
        <div className="w-px bg-[hsl(var(--border))] mx-1 my-1" />
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonthFilter(m)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              monthFilter === m
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {monthLabel(m).split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <EmptyRow text="No orders match your filters" />}
        {filtered.map((o) => (
          <div
            key={o.id}
            className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))]"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{o.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {o.size} · Qty {o.quantity} · {formatDate(o.sale_date)}
                </p>
              </div>
              <span
                className={`shrink-0 ml-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  o.platform === "Vinted"
                    ? "pastel-lavender text-[hsl(var(--primary))]"
                    : "pastel-mint text-emerald-700"
                }`}
              >
                {o.platform}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-[hsl(var(--border))]">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Sale</p>
                <p className="font-heading text-sm">{formatMoney(o.sale_total)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Cost</p>
                <p className="font-heading text-sm">{formatMoney(o.total_cost)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Profit</p>
                <p className="font-heading text-sm text-emerald-600">
                  {formatMoney(o.estimated_profit)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setFormOpen(true)}
        className="fixed bottom-24 right-5 max-w-md mx-auto w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add order"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <OrderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        inventoryCosts={inventoryCosts}
      />
    </div>
  );
}