import React, { useState, useMemo } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney, formatDate, monthKey, monthLabel } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import ExpenseForm from "@/components/ExpenseForm";
import ExportButton from "@/components/ExportButton";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";

const categories = [
  "All",
  "Inventory / Frames",
  "Printing Supplies",
  "Packaging",
  "Equipment",
  "Office Expense",
  "Software & Subscriptions",
  "Phone / Internet",
  "Advertising",
  "Shipping",
  "Other",
];

export default function Expenses() {
  const { records, reload: reloadExpenses } = useEntity("Expense", "-date");
  const { records: inventoryCosts } = useEntity("InventoryCost", "size");
  const { records: orders } = useEntity("Order", "-sale_date");
  const refresh = async () => { await reloadExpenses(); };
  const [filter, setFilter] = useState("All");
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);
  const [importingEmail, setImportingEmail] = useState(false);

  const importForwardedExpenses = async () => {
    setImportingEmail(true);
    try {
      const res = await base44.functions.invoke("processExpenseEmails", {});
      toast.success(res.data?.message || "Expense emails checked");
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
    () => records.reduce((s, e) => s + (e.amount || 0), 0) + frameTotal,
    [records, frameTotal]
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
          <p className="font-medium">Forwarded expense emails</p>
          <p className="text-xs text-muted-foreground mt-1">Send or forward one email to your connected Gmail with the subject ArtFlow Expense. Attach one receipt or a batch of receipts; each attachment becomes a separate expense.</p>
        </div>
        <button
          onClick={importForwardedExpenses}
          disabled={importingEmail}
          className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${importingEmail ? "animate-spin" : ""}`} />
          {importingEmail ? "Checking expense emails…" : "Import Forwarded Expenses"}
        </button>
      </section>

      <div className="pastel-peach rounded-3xl p-5 border border-[hsl(var(--border))]">
        <p className="text-[11px] font-semibold text-foreground uppercase">
          Total Business Expenses
        </p>
        <p className="font-heading text-3xl mt-1 text-foreground">{formatMoney(totalAll)}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {categories.map((c) => (
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
            <h2 className="font-heading text-base">Inventory / Frames</h2>
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