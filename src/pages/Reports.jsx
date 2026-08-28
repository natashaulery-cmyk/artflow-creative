import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useEntity, useTaxRate } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import { StatCard, PlatformBar, EmptyRow } from "@/components/Cards";
import PullToRefresh from "@/components/PullToRefresh";

const cardLink = "block active:scale-95 transition-transform";

const periods = [
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last3", label: "Last 3 Months" },
  { key: "thisYear", label: "This Year" },
  { key: "allTime", label: "All Time" },
];

function inPeriod(dateStr, key) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "thisMonth") return d.getFullYear() === y && d.getMonth() === m;
  if (key === "lastMonth") {
    const lm = new Date(y, m - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (key === "last3") {
    const start = new Date(y, m - 2, 1);
    return d >= start && d <= new Date(y, m + 1, 0);
  }
  if (key === "thisYear") return d.getFullYear() === y;
  if (key === "allTime") return true;
  return false;
}

export default function Reports() {
  const navigate = useNavigate();
  const { records: orders, reload: reloadOrders } = useEntity("Order", "-created_date");
  const { records: expenses, reload: reloadExpenses } = useEntity("Expense", "-created_date");
  const [period, setPeriod] = useState("thisMonth");
  const [taxRate] = useTaxRate();
  const refresh = async () => {
    await Promise.all([reloadOrders(), reloadExpenses()]);
  };

  const calc = useMemo(() => {
    const po = orders.filter((o) => inPeriod(o.sale_date, period));
    const pe = expenses.filter((e) => inPeriod(e.date, period));
    const grossSales = po.reduce((s, o) => s + (o.sale_total || 0), 0);
    const numOrders = po.length;
    const itemsSold = po.reduce((s, o) => s + (o.quantity || 0), 0);
    const productCosts = po.reduce((s, o) => s + (o.total_cost || 0), 0);
    const bizExpenses = pe.reduce((s, e) => s + (e.amount || 0), 0);
    const estimatedProfit = po.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    const deductions = pe.reduce((s, e) => s + (e.deductible_amount || 0), 0);
    const taxableProfit = estimatedProfit - deductions;
    const taxReserve = Math.max(0, taxableProfit) * (taxRate / 100);

    const vintedSales = po
      .filter((o) => o.platform === "Vinted")
      .reduce((s, o) => s + (o.sale_total || 0), 0);
    const depopSales = po
      .filter((o) => o.platform === "Depop")
      .reduce((s, o) => s + (o.sale_total || 0), 0);

    return {
      grossSales,
      numOrders,
      itemsSold,
      productCosts,
      bizExpenses,
      estimatedProfit,
      taxableProfit,
      taxReserve,
      vintedSales,
      depopSales,
    };
  }, [orders, expenses, period, taxRate]);

  const maxPlatform = Math.max(calc.vintedSales, calc.depopSales, 1);

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-[hsl(var(--border))] flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-heading text-[28px] leading-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">Performance over time</p>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 h-10 rounded-full text-sm font-medium shrink-0 ${
              period === p.key
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {p.key === "last3" ? (
              <>Last <span className={period === p.key ? "" : "text-foreground"}>3</span> Months</>
            ) : (
              p.label
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/orders" className={cardLink}>
          <StatCard tone="lavender" label="Gross Sales" value={formatMoney(calc.grossSales)} sub="tap to view orders" />
        </Link>
        <Link to="/orders" className={cardLink}>
          <StatCard tone="blue" label="Number of Orders" value={String(calc.numOrders)} sub="tap to view orders" />
        </Link>
        <Link to="/orders" className={cardLink}>
          <StatCard tone="mint" label="Items Sold" value={String(calc.itemsSold)} sub="tap to view orders" />
        </Link>
        <Link to="/inventory" className={cardLink}>
          <StatCard tone="peach" label="Product Costs" value={formatMoney(calc.productCosts)} sub="tap to view inventory" />
        </Link>
        <Link to="/expenses" className={cardLink}>
          <StatCard tone="yellow" label="Business Expenses" value={formatMoney(calc.bizExpenses)} sub="tap to view expenses" />
        </Link>
        <Link to="/orders" className={cardLink}>
          <StatCard tone="mint" label="Estimated Profit" value={formatMoney(calc.estimatedProfit)} sub="tap to view orders" />
        </Link>
        <Link to="/taxes" className={cardLink}>
          <StatCard tone="lavender" label="Taxable Profit" value={formatMoney(calc.taxableProfit)} sub="tap to view taxes" />
        </Link>
        <Link to="/taxes" className={cardLink}>
          <StatCard tone="peach" label="Tax Reserve" value={formatMoney(calc.taxReserve)} sub="tap to view taxes" />
        </Link>
      </div>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Sales Split</h2>
        <PlatformBar
          label="Vinted"
          value={calc.vintedSales}
          max={maxPlatform}
          color="bg-[hsl(var(--primary))]"
        />
        <PlatformBar
          label="Depop"
          value={calc.depopSales}
          max={maxPlatform}
          color="bg-slate-400"
        />
      </section>

      {calc.numOrders === 0 && <EmptyRow text="No orders in this period" />}
    </div>
  );
}