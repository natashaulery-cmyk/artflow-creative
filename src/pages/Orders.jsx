import React, { useState, useMemo, useEffect } from "react";
import { Search, Plus, RefreshCw } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { base44 } from "@/api/base44Client";
import { formatMoney, formatDate, currentMonthKey, monthShort } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import OrderForm from "@/components/OrderForm";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";
import { useLocation } from "react-router-dom";
import PullToRefresh from "@/components/PullToRefresh";
import SyncStatus from "@/components/SyncStatus";
import { PLATFORMS, PLATFORM_TONE, displayPlatform, displayProductName } from "@/lib/platforms";
import { toast } from "sonner";

export default function Orders() {
  const { records: orders, reload: reloadOrders } = useOrders();
  const { records: inventoryCosts } = useEntity("InventoryCost", "size");
  const refresh = async () => { await reloadOrders(); };
  const { pathname } = useLocation();
  const [platformFilter, setPlatformFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");
  // This tab stays mounted between visits. Reset it to the newest month whenever
  // the user opens Orders so an older selection such as January cannot persist.
  useEffect(() => {
    if (pathname === "/orders") {
      setMonthFilter("All");
      setPlatformFilter("All");
      reloadOrders();
    }
  }, [pathname, reloadOrders]);
  const [search, setSearch] = useState("");
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [importingEmail, setImportingEmail] = useState(false);

  const importEmailSales = async () => {
    setImportingEmail(true);
    try {
      const directSources = ["syncVintedPro", "syncDepopPartner", "syncEtsy"];
      const directMessages = [];


      // Direct marketplace APIs are authoritative when available. Drain their
      // paginated history first so large shops can catch up in one button press.
      for (const functionName of directSources) {
        try {
          let res = await base44.functions.invoke(functionName, {});
          let data = res?.data || {};
          let pass = 0;
          while (data.more_possible && pass < 12) {
            await reloadOrders();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            res = await base44.functions.invoke(functionName, {});
            data = res?.data || {};
            pass += 1;
          }
          if (data.available !== false && data.message) directMessages.push(data.message);
        } catch (e) {
          // Gmail remains the fallback until a marketplace grants production API
          // credentials, so one unavailable direct source must not block syncing.
          const message = e?.response?.data?.error || e?.message || "";
          if (message) directMessages.push(message);
        }
      }

      let res = await base44.functions.invoke("processSaleEmails", {});
      let data = res?.data || {};
      let pass = 0;

      // Keep draining bounded backend batches so a user with hundreds of older
      // orders does not have to press Sync repeatedly or wait minutes between runs.
      while (Number(data.remaining || 0) > 0 && pass < 12) {
        if (/already running/i.test(String(data.message || ""))) break;
        await reloadOrders();
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        res = await base44.functions.invoke("processSaleEmails", {});
        data = res?.data || {};
        pass += 1;
      }

      const emailMessages = [];
      if (data.message) emailMessages.push(data.message);

      // Microsoft/Outlook is an independent per-user inbox. If it is not
      // connected yet, its failure is non-blocking and Gmail/direct APIs still
      // complete normally.
      try {
        let outlookRes = await base44.functions.invoke("processOutlookSaleEmails", {});
        let outlookData = outlookRes?.data || {};
        let outlookPass = 0;
        while (Number(outlookData.remaining || 0) > 0 && outlookPass < 12) {
          await reloadOrders();
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          outlookRes = await base44.functions.invoke("processOutlookSaleEmails", {});
          outlookData = outlookRes?.data || {};
          outlookPass += 1;
        }
        if (outlookData.message) emailMessages.push(outlookData.message);
      } catch {
        // Not connected is expected for users who only use Gmail.
      }

      toast.success(emailMessages.at(-1) || directMessages.at(-1) || "All available sales are synced");
      await reloadOrders();
    } catch (e) {
      toast.error("Sales sync failed", { description: e?.response?.data?.error || e?.message });
    } finally {
      setImportingEmail(false);
    }
  };

  // Build the month list from real order history (plus the current month),
  // sorted newest-first so the most recent month — August — always leads
  // instead of a hardcoded January start.
  const months = useMemo(() => {
    const set = new Set([currentMonthKey()]);
    orders.forEach((o) => {
      if (o.sale_date) set.add(o.sale_date.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [orders]);

  const isBundle = (o) => /bundle/i.test(o.product_name || "");
  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (platformFilter === "Bundles") {
          if (!isBundle(o)) return false;
        } else if (platformFilter !== "All" && displayPlatform(o.platform) !== platformFilter) return false;
        if (monthFilter !== "All" && (o.sale_date || "").slice(0, 7) !== monthFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!`${o.product_name} ${o.order_id || ""}`.toLowerCase().includes(q))
            return false;
        }
        return true;
      })
      .sort((a, b) => (b.sale_date || "").localeCompare(a.sale_date || ""));
  }, [orders, platformFilter, monthFilter, search]);

  const summary = useMemo(() => {
    const sales = filtered.reduce((s, o) => s + (o.sale_total || 0), 0);
    const profit = filtered.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    const count = filtered.reduce((s, o) => s + Math.max(1, Number(o.quantity) || 1), 0);
    return { sales, profit, count };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader title="Orders" subtitle="Sold items across platforms" />
      <SyncStatus totalOrders={orders.length} />

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
        onClick={importEmailSales}
        disabled={importingEmail}
        className="w-full h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60"
      >
        <RefreshCw className={`w-4 h-4 ${importingEmail ? "animate-spin" : ""}`} />
        {importingEmail ? "Syncing all sales…" : "Sync All Sales Now"}
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
                <p className="font-medium truncate">{displayProductName(o)}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground">{o.size}</span> · Qty <span className="text-foreground">{o.quantity}</span> · <span className="text-foreground">{formatDate(o.sale_date)}</span>
                </p>
              </div>
              <span
                className={`shrink-0 ml-2 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  PLATFORM_TONE[displayPlatform(o.platform)] || "bg-muted text-muted-foreground"
                }`}
              >
                {displayPlatform(o.platform)}
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