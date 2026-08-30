import React, { useState, useMemo } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useEntity } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { formatMoney, formatDate, monthKey, monthLabel } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import ExpenseForm from "@/components/ExpenseForm";
import ExportButton from "@/components/ExportButton";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";
import { EXPENSE_CATEGORY_FILTERS } from "@/lib/expenseCategories";

export default function Expenses() {
  const { records, reload: reloadExpenses } = useEntity("Expense", "-date");
  const { records: inventoryCosts } = useEntity("InventoryCost", "size");
  const { records: orders } = useOrders();
  const refresh = async () => { await reloadExpenses(); };
  const [filter, setFilter] = useState("All");
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);
  const [importingEmail, setImportingEmail] = useState(false);

  const importForwardedExpenses = async () => {
    setImportingEmail(true);
    try {
      const messages = [];

      // Primary email sources first. Each provider is optional and independent;
      // an unconnected inbox must never block the rest of the expense sync.
      for (const functionName of ["processExpenseEmails", "processOutlookExpenseEmails"]) {
        try {
          let res = await base44.functions.invoke(functionName, {});
          let data = res?.data || {};
          let pass = 0;
          while (Number(data.remaining || 0) > 0 && pass < 12) {
            await reloadExpenses();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            res = await base44.functions.invoke(functionName, {});
            data = res?.data || {};
            pass += 1;
          }
          if (data.message) messages.push(data.message);
        } catch {
          // Expected when that provider is not connected for this user.
        }
      }

      // Google Sheets runs last by design. It only adds rows that do not match
      // an existing expense, so it is the safety net rather than the authority.
      try {
        const sheetRes = await base44.functions.invoke("syncSheetExpenseFallback", {});
        const sheetData = sheetRes?.data || {};
        if (sheetData.message) messages.push(sheetData.message);
      } catch {
        // Spreadsheet backup is optional.
      }

      toast.success(messages.at(-1) || "All connected expense sources are up to date");
      await reloadExpenses();
    } catch (e) {
      toast.error("Expense import failed", { description: e?.response?.data?.error || e?.message });
    } finally {
      setImportingEmail(false);
    }
  };

  const frameItems = useMemo(
    () =>
      inventoryCosts
        .filter((i) => (i.category || "Frame") === "Frame")
        .map((i) => ({
          size: i.size,
          qty: i.quantity_on_hand || 0,
          unit: i.base_item_cost || 0,
          total: +(((i.base_item_cost || 0) * (i.quantity_on_hand || 0)).toFixed(2)),
        }))
        .filter((f) => f.qty > 0),
    [inventoryCosts]
  );

  const frameTotal = useMemo(
    () => frameItems.reduce((s, f) => s + f.total, 0),
    [frameItems]
  );

  const filtered = useMemo(() => {
    return records.filter((e) => filter === "All" || e.category === filter);
  }, [records, filter]);

  const totalAll = useMemo(
    () => records.reduce((s, e) => s + (e.amount || 0), 0),
    [records]
  );

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const k = monthKey(e.date);
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    return Object.keys(map)
      .sort()
      .reverse()
      .map((k) => ({ key: k, label: monthLabel(k), items: map[k] }));
  }, [filtered]);

  const openEdit = (rec) => {
    setEditRecord(rec);
    openForm();
  };

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader
        title="Expenses"
        subtitle="Track business deductions"
        right={
          <div className="flex items-center gap-2">
            <ExportButton orders={orders} expenses={records} />
            <button
              onClick={() => {
                setEditRecord(null);
                openForm();
              }}
              className="shrink-0 h-11 px-4 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} /> Add
            </button>
          </div>
        }
      />

      <section className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] space-y-3">
        <div>
          <p className="font-medium">Automatic art expense sync</p>
          <p className="text-xs text-muted-foreground mt-1">Art Flow checks each connected inbox for paid art-business purchases and receipts, including supplies, printing, packaging, frames, equipment, photography gear, software, shipping, and other clearly business-related art expenses. After email sync, your Google Sheet backup fills in missing expenses without overwriting or double-counting existing records.</p>
        </div>
        <button
          onClick={importForwardedExpenses}
          disabled={importingEmail}
          className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${importingEmail ? "animate-spin" : ""}`} />
          {importingEmail ? "Checking all expense sources…" : "Sync All Art Expenses"}
        </button>
      </section>

      <div className="pastel-peach rounded-3xl p-5 border border-[hsl(var(--border))]">
        <p className="text-[11px] font-semibold text-foreground uppercase">
          Total Business Expenses
        </p>
        <p className="font-heading text-3xl mt-1 text-foreground">{formatMoney(totalAll)}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {EXPENSE_CATEGORY_FILTERS.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3.5 h-9 rounded-full text-xs font-medium shrink-0 ${
              filter === c
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {filter === "All" && frameItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <div>
              <h2 className="font-heading text-base">Frame Inventory on Hand</h2>
              <p className="text-[11px] text-muted-foreground">Asset value — not added again to expenses</p>
            </div>
            <span className="text-sm text-foreground">
              {formatMoney(frameTotal)}
            </span>
          </div>
          <div className="space-y-2">
            {frameItems.map((f) => (
              <div
                key={f.size}
                className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">Frames — {f.size}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">{f.qty}</span> on hand × <span className="text-foreground">{formatMoney(f.unit)}</span>
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="font-heading text-base">{formatMoney(f.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {grouped.length === 0 && <EmptyRow text="No expenses yet" />}

      {grouped.map((group) => (
        <section key={group.key}>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-heading text-base">{group.label}</h2>
            <span className="text-sm text-foreground">
              {formatMoney(group.items.reduce((s, e) => s + (e.amount || 0), 0))}
            </span>
          </div>
          <div className="space-y-2">
            {group.items.map((e) => (
              <button
                key={e.id}
                onClick={() => openEdit(e)}
                className="w-full text-left bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.category} · <span className="text-foreground">{formatDate(e.date)}</span>
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="font-heading text-base">{formatMoney(e.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">{e.deductible_percent ?? 100}%</span> ded.
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <button
        onClick={() => {
          setEditRecord(null);
          openForm();
        }}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add expense"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ExpenseForm
        open={formOpen}
        onClose={closeForm}
        record={editRecord}
      />
    </div>
  );
}