import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatMoney } from "@/lib/format";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function Row({ label, value, isCount }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">
        {isCount ? value : formatMoney(value)}
      </span>
    </div>
  );
}

export default function MonthlySummary({ orders, expenses }) {
  const [month, setMonth] = useState(currentMonthKey());

  const months = useMemo(() => {
    const set = new Set();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), i, 1);
      set.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
    orders.forEach((o) => {
      const k = (o.sale_date || "").slice(0, 7);
      if (k) set.add(k);
    });
    expenses.forEach((e) => {
      const k = (e.date || "").slice(0, 7);
      if (k) set.add(k);
    });
    return [...set].filter(Boolean).sort().reverse();
  }, [orders, expenses]);

  const calc = useMemo(() => {
    const mo = orders.filter((o) => (o.sale_date || "").slice(0, 7) === month);
    const me = expenses.filter((e) => (e.date || "").slice(0, 7) === month);
    const grossSales = mo.reduce((s, o) => s + (o.sale_total || 0), 0);
    const productCosts = mo.reduce((s, o) => s + (o.total_cost || 0), 0);
    const bizExpenses = me.reduce((s, e) => s + (e.amount || 0), 0);
    const totalCosts = productCosts + bizExpenses;
    const netProfit = grossSales - totalCosts;
    const numOrders = mo.length;
    const itemsSold = mo.reduce((s, o) => s + (o.quantity || 0), 0);
    return { grossSales, productCosts, bizExpenses, totalCosts, netProfit, numOrders, itemsSold };
  }, [orders, expenses, month]);

  const positive = calc.netProfit >= 0;

  return (
    <section className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {months.map((mk) => (
          <button
            key={mk}
            onClick={() => setMonth(mk)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              month === mk
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-foreground"
            }`}
          >
            {monthLabel(mk)}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Net Profit · {monthLabel(month)}
          </p>
          {positive ? (
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-600" />
          )}
        </div>
        <p className="font-heading text-4xl mt-2 text-foreground">
          {formatMoney(calc.netProfit)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Sales minus product costs & expenses
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sales</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(calc.grossSales)}</p>
        </div>
        <div className="pastel-peach rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Costs</p>
          <p className="font-heading text-lg mt-1 text-foreground">{formatMoney(calc.totalCosts)}</p>
        </div>
        <div className="pastel-blue rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Orders</p>
          <p className="font-heading text-lg mt-1 text-foreground">{calc.numOrders}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] space-y-2">
        <Row label="Product costs" value={calc.productCosts} />
        <Row label="Business expenses" value={calc.bizExpenses} />
        <Row label="Items sold" value={calc.itemsSold} isCount />
      </div>
    </section>
  );
}