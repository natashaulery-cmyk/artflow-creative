import React, { useMemo } from "react";
import { formatMoney, monthShort } from "@/lib/format";

// Estimated monthly tax liability driven by total sales income:
// each month's tax liability = gross sales × tax rate.
export default function TaxLiabilityTracker({ orders, taxRate }) {
  const months = useMemo(() => {
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
  }, []);

  const rows = useMemo(() => {
    const byMonth = {};
    orders.forEach((o) => {
      const k = (o.sale_date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      byMonth[k] = (byMonth[k] || 0) + (o.sale_total || 0);
    });
    return months.map((k) => {
      const sales = byMonth[k] || 0;
      return {
        key: k,
        label: monthShort(k),
        sales,
        liability: sales * (taxRate / 100),
      };
    });
  }, [months, orders, taxRate]);

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalLiability = rows.reduce((s, r) => s + r.liability, 0);

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading text-lg">Estimated Tax Liability</h2>
        <span className="text-xs text-muted-foreground">
          <span className="text-foreground">{taxRate}%</span> of sales income
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Monthly tax estimate based on total sales income
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Sales Income</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(totalSales)}</p>
        </div>
        <div className="pastel-peach rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Tax Liability</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(totalLiability)}</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-3 gap-2 px-2 pb-2 border-b border-[hsl(var(--border))]">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Month</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Sales</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Tax Liability</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-3 gap-2 px-2 py-2.5 rounded-xl odd:bg-muted/40"
          >
            <span className="text-sm text-foreground truncate">{r.label}</span>
            <span className="text-sm text-right text-foreground">{formatMoney(r.sales)}</span>
            <span className="text-sm text-right font-medium text-foreground">{formatMoney(r.liability)}</span>
          </div>
        ))}
        {totalSales === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No sales recorded yet
          </p>
        )}
      </div>
    </section>
  );
}