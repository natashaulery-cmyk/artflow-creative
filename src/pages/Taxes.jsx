import React, { useMemo } from "react";
import { useEntity, useTaxRate } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import { StatCard } from "@/components/Cards";

export default function Taxes() {
  const { records: orders } = useEntity("Order", "-sale_date");
  const { records: expenses } = useEntity("Expense", "-date");
  const [rate, setRate] = useTaxRate();

  const year = new Date().getFullYear();

  const calc = useMemo(() => {
    const yearOrders = orders.filter((o) => (o.sale_date || "").slice(0, 4) === String(year));
    const yearExpenses = expenses.filter((e) => (e.date || "").slice(0, 4) === String(year));
    const businessProfit = yearOrders.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    const deductions = yearExpenses.reduce((s, e) => s + (e.deductible_amount || 0), 0);
    const taxableProfit = businessProfit - deductions;
    const reserve = Math.max(0, taxableProfit) * (rate / 100);
    const afterReserve = taxableProfit - reserve;
    return { businessProfit, deductions, taxableProfit, reserve, afterReserve };
  }, [orders, expenses, year, rate]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-[28px] leading-tight">Taxes</h1>
        <p className="text-muted-foreground text-sm">{year} tax overview</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          tone="mint"
          label="Business Profit"
          value={formatMoney(calc.businessProfit)}
        />
        <StatCard
          tone="peach"
          label="Additional Deductions"
          value={formatMoney(calc.deductions)}
        />
      </div>

      <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Taxable Business Profit
          </span>
        </div>
        <p className="font-heading text-3xl text-foreground">
          {formatMoney(calc.taxableProfit)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Estimated profit minus business deductions
        </p>
      </div>

      <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide block mb-3">
          Tax Reserve Rate
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="50"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="flex-1 accent-[hsl(var(--primary))]"
          />
          <div className="flex items-center w-20 shrink-0">
            <input
              type="number"
              min="0"
              max="100"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-14 h-12 px-3 rounded-2xl bg-muted border border-input text-center text-lg font-heading focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-lg ml-1">%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="pastel-yellow rounded-3xl p-5 border border-[hsl(var(--border))]">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">
            Suggested Tax Reserve
          </p>
          <p className="font-heading text-3xl mt-1">{formatMoney(calc.reserve)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {rate}% of taxable business profit
          </p>
        </div>
        <div className="pastel-blue rounded-3xl p-5 border border-[hsl(var(--border))]">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">
            After Tax Reserve
          </p>
          <p className="font-heading text-3xl mt-1">{formatMoney(calc.afterReserve)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            What remains after setting aside taxes
          </p>
        </div>
      </div>
    </div>
  );
}