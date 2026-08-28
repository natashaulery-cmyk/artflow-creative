import React, { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney, formatDate, monthKey, monthLabel } from "@/lib/format";
import { EmptyRow } from "@/components/Cards";
import MileageForm from "@/components/MileageForm";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";

export default function Mileage() {
  const { records, reload } = useEntity("MileageLog", "-date");
  const refresh = async () => { await reload(); };
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);

  const totals = useMemo(() => {
    const miles = records.reduce((s, m) => s + (Number(m.miles) || 0), 0);
    const deduction = records.reduce((s, m) => s + (Number(m.deduction) || 0), 0);
    return { miles, deduction };
  }, [records]);

  const grouped = useMemo(() => {
    const map = {};
    records.forEach((m) => {
      const k = monthKey(m.date);
      if (!map[k]) map[k] = [];
      map[k].push(m);
    });
    return Object.keys(map)
      .sort()
      .reverse()
      .map((k) => ({
        key: k,
        label: monthLabel(k),
        items: map[k],
        miles: map[k].reduce((s, m) => s + (Number(m.miles) || 0), 0),
        deduction: map[k].reduce((s, m) => s + (Number(m.deduction) || 0), 0),
      }));
  }, [records]);

  const openEdit = (rec) => {
    setEditRecord(rec);
    openForm();
  };

  const add = () => {
    setEditRecord(null);
    openForm();
  };

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader
        title="Mileage"
        subtitle="Log business drives"
        right={
          <button
            onClick={add}
            className="shrink-0 h-11 px-4 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold flex items-center gap-2 active:scale-95 transition-transform"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} /> Add
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Total Miles</p>
          <p className="font-heading text-2xl mt-1 text-foreground">
            {totals.miles.toLocaleString("en-US", { maximumFractionDigits: 1 })}
          </p>
        </div>
        <div className="pastel-peach rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Deduction</p>
          <p className="font-heading text-2xl mt-1 text-foreground">{formatMoney(totals.deduction)}</p>
        </div>
      </div>

      {grouped.length === 0 && <EmptyRow text="No trips logged yet" />}

      {grouped.map((group) => (
        <section key={group.key}>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-heading text-base">{group.label}</h2>
            <span className="text-sm text-foreground">
              {group.miles.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi · {formatMoney(group.deduction)}
            </span>
          </div>
          <div className="space-y-2">
            {group.items.map((m) => (
              <button
                key={m.id}
                onClick={() => openEdit(m)}
                className="w-full text-left bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.destination}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.purpose ? `${m.purpose} · ` : ""}<span className="text-foreground">{formatDate(m.date)}</span>
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="font-heading text-base">{formatMoney(m.deduction)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">{Number(m.miles).toLocaleString("en-US", { maximumFractionDigits: 1 })}</span> mi
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <button
        onClick={add}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Log mileage"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <MileageForm
        open={formOpen}
        onClose={closeForm}
        record={editRecord}
      />
    </div>
  );
}