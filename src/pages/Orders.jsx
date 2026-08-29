import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, RefreshCw } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { base44 } from "@/api/base44Client";
import { formatMoney, formatDate, currentMonthKey, monthShort } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import OrderForm from "@/components/OrderForm";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";
import { useSearchParams } from "react-router-dom";
import PullToRefresh from "@/components/PullToRefresh";
import { PLATFORMS, PLATFORM_TONE } from "@/lib/platforms";
import { toast } from "sonner";

export default function Orders() {
  const { records: orders, reload: reloadOrders } = useEntity("Order", "-sale_date");
  const { records: inventoryCosts } = useEntity("InventoryCost", "size");
  const refresh = async () => { await reloadOrders(); };
  const initialMonth = new URLSearchParams(window.location.search).get("month");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState(initialMonth || "All");
  const [searchParams] = useSearchParams();
  const monthParam = searchParams.get("month");
  // Sync the month filter when arriving via a ?month= deep link (e.g. from the
  // Dashboard). Needed because this view is kept mounted across tab switches.
  useEffect(() => {
    if (monthParam) setMonthFilter(monthParam);
  }, [monthParam]);
  const [search, setSearch] = useState("");
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
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

  const months = useMemo(() => {
    const keys = orders
      .map((o) => (o.sale_date || "").slice(0, 7))
      .filter((k) => /^\d{4}-\d{2}$/.test(k));
    const now = new Date();
    const endKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [ey, em] = endKey.split("-").map(Number);
    const list = [];
    for (let y = 2026; y <= ey; y++) {
      const mEnd = y === ey ? em : 12;
      for (let m = 1; m <= mEnd; m++) {
        list.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    return list;
  }, [orders]);

  const isBundle = (o) => /bundle/i.test(o.product_name || "");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (platformFilter === "Bundles") {
        if (!isBundle(o)) return false;
      } else if (platformFilter !== "All" && o.platform !== platformFilter) return false;
      if (monthFilter !== "All" && (o.sale_date || "").slice(0, 7) !== monthFilter) return false;
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
      <PullToRefresh onRefresh={refresh} />
      <PageHeader title="Orders" subtitle="Sold items across platforms" />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        <button
          onClick={() => setMonthFilter("All")}
          className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
            monthFilter === "All"
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "bg-muted text-foreground"
          }`}
        >
          All months
        </button>
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonthFilter(m)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              monthFilter === m
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-foreground"
            }`}
          >
            {monthShort(m)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sales</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(summary.sales)}</p>
        </div>
        <div className="pastel-blue rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Orders</p>
          <p className="font-heading text-lg mt-1 text-foreground">{summary.count}</p>
        </div>
        <div className="pastel-mint rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Profit</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(summary.profit)}</p>
        </div>
      </div>

      <button
        onClick={syncEmails}
        disabled={syncing}
        className="w-full h-11 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync Emails
      </button>

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
        {["All", ...PLATFORMS, "Bundles"].map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              platformFilter === p
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-foreground"
            }`}
          >
            {p}
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
                  <span className="text-foreground">{o.size}</span> · Qty <span className="text-foreground">{o.quantity}</span> · <span className="text-foreground">{formatDate(o.sale_date)}</span>
                </p>
              </div>
              <span
                className={`shrink-0 ml-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  PLATFORM_TONE[o.platform] || "bg-muted text-muted-foreground"
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
                <p className="font-heading text-sm text-foreground">
                  {formatMoney(o.estimated_profit)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openForm}
        className="fixed bottom-24 right-5 max-w-md mx-auto w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add order"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <OrderForm
        open={formOpen}
        onClose={closeForm}
        inventoryCosts={inventoryCosts}
      />
    </div>
  );
}