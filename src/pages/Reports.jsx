import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { useEntity, useTaxRate } from "@/lib/useBusinessData";
import { useOrders } from "@/lib/useOrders";
import { formatMoney } from "@/lib/format";
import { StatCard, PlatformBar, EmptyRow } from "@/components/Cards";
import MonthlySummary from "@/components/MonthlySummary";
import TaxLiabilityTracker from "@/components/TaxLiabilityTracker";
import ExportButton from "@/components/ExportButton";
import PullToRefresh from "@/components/PullToRefresh";
import { PLATFORMS, PLATFORM_BAR } from "@/lib/platforms";

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
  const { records: orders, reload: reloadOrders } = useOrders();
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
    const netProfit = grossSales - productCosts - bizExpenses;
    const expenseCount = pe.length;
    const deductions = pe.reduce((s, e) => s + (e.deductible_amount || 0), 0);
    const taxableProfit = estimatedProfit - deductions;
    const taxReserve = Math.max(0, taxableProfit) * (taxRate / 100);

    const expenseCategories = Object.entries(
      pe.reduce((acc, e) => {
        const category = e.category || "Other";
        acc[category] = (acc[category] || 0) + (e.amount || 0);
        return acc;
      }, {})
    )
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const platformSales = PLATFORMS.map((p) => ({
      platform: p,
      sales: po
        .filter((o) => o.platform === p)
        .reduce((s, o) => s + (o.sale_total || 0), 0),
    }));

    return {
      grossSales,
      numOrders,
      itemsSold,
      productCosts,
      bizExpenses,
      expenseCount,
      expenseCategories,
      estimatedProfit,
      netProfit,
      taxableProfit,
      taxReserve,
      platformSales,
    };
  }, [orders, expenses, period, taxRate]);

  const maxPlatform = Math.max(...calc.platformSales.map((p) => p.sales), 1);

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader
        title="Reports"
        subtitle="Performance over time"
        onBack={() => navigate(-1)}
        right={<ExportButton orders={orders} expenses={expenses} />}
      />

      <MonthlySummary orders={orders} expenses={expenses} />

      <TaxLiabilityTracker orders={orders} expenses={expenses} taxRate={taxRate} />

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
          <StatCard tone="yellow" label="Business Expenses" value={formatMoney(calc.bizExpenses)} sub={`${calc.expenseCount} expense${calc.expenseCount === 1 ? "" : "s"}`} />
        </Link>
        <Link to="/expenses" className={cardLink}>
          <StatCard tone="mint" label="Net Profit" value={formatMoney(calc.netProfit)} sub="sales minus product costs & expenses" />
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
        {calc.platformSales.map(({ platform, sales }) => (
          <PlatformBar
            key={platform}
            label={platform}
            value={sales}
            max={maxPlatform}
            color={PLATFORM_BAR[platform]}
          />
        ))}
      </section>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg">Expense Breakdown</h2>
          <Link to="/expenses" className="text-sm text-[hsl(var(--primary))] font-medium">View expenses</Link>
        </div>
        {calc.expenseCategories.length > 0 ? (
          <div className="space-y-3">
            {calc.expenseCategories.map(({ category, amount }) => (
              <div key={category} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{category}</span>
                <span className="text-sm font-semibold text-foreground">{formatMoney(amount)}</span>
              </div>
            ))}
            <div className="pt-3 mt-3 border-t border-[hsl(var(--border))] flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Total expenses</span>
              <span className="font-heading text-lg text-foreground">{formatMoney(calc.bizExpenses)}</span>
            </div>
          </div>
        ) : (
          <EmptyRow text="No expenses in this period" />
        )}
      </section>

      {calc.numOrders === 0 && calc.expenseCount === 0 && <EmptyRow text="No sales or expenses in this period" />}
    </div>
  );
}