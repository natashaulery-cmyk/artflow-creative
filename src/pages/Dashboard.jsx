import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, BarChart3 } from "lucide-react";
import { useEntity, useTaxRate } from "@/lib/useBusinessData";
import { formatMoney, formatMoneyShort, formatDate, currentMonthKey } from "@/lib/format";
import { StatCard, MiniCard, PlatformBar, EmptyRow } from "@/components/Cards";

export default function Dashboard() {
  const { records: orders } = useEntity("Order", "-created_date");
  const { records: expenses } = useEntity("Expense", "-created_date");
  const [taxRate] = useTaxRate();

  const mk = currentMonthKey();

  const calc = useMemo(() => {
    const monthOrders = orders.filter((o) => (o.sale_date || "").slice(0, 7) === mk);
    const monthExpenses = expenses.filter((e) => (e.date || "").slice(0, 7) === mk);
    const thisMonthSales = monthOrders.reduce((s, o) => s + (o.sale_total || 0), 0);
    const thisMonthProfit = monthOrders.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    const thisMonthDeductions = monthExpenses.reduce(
      (s, e) => s + (e.deductible_amount || 0),
      0
    );
    const taxableProfit = thisMonthProfit - thisMonthDeductions;
    const taxReserve = Math.max(0, taxableProfit) * (taxRate / 100);

    const vintedSales = monthOrders
      .filter((o) => o.platform === "Vinted")
      .reduce((s, o) => s + (o.sale_total || 0), 0);
    const depopSales = monthOrders
      .filter((o) => o.platform === "Depop")
      .reduce((s, o) => s + (o.sale_total || 0), 0);

    const allTimeSales = orders.reduce((s, o) => s + (o.sale_total || 0), 0);
    const itemsSold = orders.reduce((s, o) => s + (o.quantity || 0), 0);
    const orderCosts = orders.reduce((s, o) => s + (o.total_cost || 0), 0);
    const allTimeProfit = orders.reduce((s, o) => s + (o.estimated_profit || 0), 0);
    const allTimeDeductions = expenses.reduce((s, e) => s + (e.deductible_amount || 0), 0);
    const taxableProfitAll = allTimeProfit - allTimeDeductions;

    return {
      thisMonthSales,
      thisMonthProfit,
      thisMonthDeductions,
      taxReserve,
      orderCount: monthOrders.length,
      vintedSales,
      depopSales,
      allTimeSales,
      itemsSold,
      orderCosts,
      taxableProfitAll,
    };
  }, [orders, expenses, mk, taxRate]);

  const recentOrders = orders.slice(0, 5);
  const recentExpenses = expenses.slice(0, 5);
  const maxPlatform = Math.max(calc.vintedSales, calc.depopSales, 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-[28px] leading-tight text-foreground">
          Affordable Art Co
        </h1>
        <p className="text-muted-foreground text-sm">Business Dashboard</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Link to={`/orders?month=${mk}`} className="block">
          <StatCard
            tone="lavender"
            label="This Month Sales"
            value={formatMoney(calc.thisMonthSales)}
            sub={`${calc.orderCount} orders · tap to view`}
          />
        </Link>
        <Link to="/orders?month=All" className="block">
          <StatCard
            tone="mint"
            label="Estimated Profit"
            value={formatMoney(calc.thisMonthProfit)}
            sub="tap to view all"
          />
        </Link>
        <Link to="/expenses" className="block">
          <StatCard
            tone="peach"
            label="Business Deductions"
            value={formatMoney(calc.thisMonthDeductions)}
            sub="tap to view expenses"
          />
        </Link>
        <StatCard
          tone="yellow"
          label="Tax Reserve"
          value={formatMoney(calc.taxReserve)}
          sub={`${taxRate}% set aside`}
        />
      </div>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Sales by Platform</h2>
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
          color="bg-emerald-400"
        />
      </section>

      <section>
        <h2 className="font-heading text-lg mb-3">Business Snapshot</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/orders?month=All" className="block">
            <MiniCard label="All-Time Sales" value={formatMoneyShort(calc.allTimeSales)} />
          </Link>
          <MiniCard label="Items Sold" value={String(calc.itemsSold)} />
          <MiniCard label="Order Costs" value={formatMoneyShort(calc.orderCosts)} />
          <MiniCard label="Taxable Profit" value={formatMoneyShort(calc.taxableProfitAll)} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg">Recent Orders</h2>
          <Link to="/orders" className="text-sm text-[hsl(var(--primary))] font-medium">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {recentOrders.length === 0 && <EmptyRow text="No orders yet" />}
          {recentOrders.map((o) => (
            <div
              key={o.id}
              className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{o.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {o.platform} · {formatDate(o.sale_date)}
                </p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="font-heading text-base">{formatMoney(o.sale_total)}</p>
                <p className="text-xs text-emerald-600">
                  {formatMoney(o.estimated_profit)} profit
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg">Recent Expenses</h2>
          <Link to="/expenses" className="text-sm text-[hsl(var(--primary))] font-medium">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {recentExpenses.length === 0 && <EmptyRow text="No expenses yet" />}
          {recentExpenses.map((e) => (
            <div
              key={e.id}
              className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {e.category} · {formatDate(e.date)}
                </p>
              </div>
              <p className="font-heading text-base ml-3 shrink-0">{formatMoney(e.amount)}</p>
            </div>
          ))}
        </div>
        <Link
          to="/expenses"
          className="mt-3 flex items-center justify-center gap-2 h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
        >
          <Plus className="w-5 h-5" /> Add Expense
        </Link>
      </section>

      <Link
        to="/reports"
        className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--primary))] font-medium py-3"
      >
        <BarChart3 className="w-4 h-4" /> View Reports
      </Link>
    </div>
  );
}