import React, { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney, formatDate, monthKey, monthLabel } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import ExpenseForm from "@/components/ExpenseForm";
import PullToRefresh from "@/components/PullToRefresh";

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
  const refresh = async () => { await reloadExpenses(); };
  const [filter, setFilter] = useState("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

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
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <header>
        <h1 className="font-heading text-[28px] leading-tight">Expenses</h1>
        <p className="text-muted-foreground text-sm">Track business deductions</p>
      </header>

      <div className="pastel-peach rounded-3xl p-5 border border-[hsl(var(--border))]">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase">
          Total Business Expenses
        </p>
        <p className="font-heading text-3xl mt-1">{formatMoney(totalAll)}</p>
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
            <span className="text-sm text-muted-foreground">
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
                    {f.qty} on hand × {formatMoney(f.unit)}
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
            <span className="text-sm text-muted-foreground">
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
                    {e.category} · {formatDate(e.date)}
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="font-heading text-base">{formatMoney(e.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.deductible_percent ?? 100}% ded.
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
          setFormOpen(true);
        }}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add expense"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ExpenseForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        record={editRecord}
      />
    </div>
  );
}