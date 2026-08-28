import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, BarChart3, UserCircle, Image as ImageIcon } from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import { useEntity, useTaxRate } from "@/lib/useBusinessData";
import { formatMoney, formatMoneyShort, formatDate, currentMonthKey } from "@/lib/format";
import { StatCard, MiniCard, PlatformBar, EmptyRow } from "@/components/Cards";
import LowStockAlert from "@/components/LowStockAlert";
import { PLATFORMS, PLATFORM_BAR } from "@/lib/platforms";

const cardLink = "block active:scale-95 transition-transform";

export default function Dashboard() {
  const { records: orders, reload: reloadOrders } = useEntity("Order", "-created_date");
  const { records: expenses, reload: reloadExpenses } = useEntity("Expense", "-created_date");
  const { records: inventory } = useEntity("InventoryCost", "-created_date");
  const [taxRate] = useTaxRate();
  const refresh = async () => {
    await Promise.all([reloadOrders(), reloadExpenses()]);
  };

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

    const platformSales = PLATFORMS.map((p) => ({
      platform: p,
      sales: monthOrders
        .filter((o) => o.platform === p)
        .reduce((s, o) => s + (o.sale_total || 0), 0),
    }));

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
      platformSales,
      allTimeSales,
      itemsSold,
      orderCosts,
      taxableProfitAll,
    };
  }, [orders, expenses, mk, taxRate]);

  const recentOrders = orders.slice(0, 5);
  const recentExpenses = expenses.slice(0, 5);
  const maxPlatform = Math.max(...calc.platformSales.map((p) => p.sales), 1);

  return (
    <div className="space-y-6">
      <PullToRefresh onRefresh={refresh} />
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-[28px] leading-tight text-foreground">
            Affordable Art Co
          </h1>
          <p className="text-muted-foreground text-sm">Business Dashboard</p>
        </div>
        <Link
          to="/account"
          className="w-9 h-9 rounded-full bg-card border border-[hsl(var(--border))] flex items-center justify-center shrink-0"
          aria-label="Account"
        >
          <UserCircle className="w-5 h-5 text-muted-foreground" />
        </Link>
      </header>

      <LowStockAlert records={inventory} />

      <div className="grid grid-cols-2 gap-3">
        <Link to={`/orders?month=${mk}`} className="block">
          <StatCard
            tone="lavender"
            label="This Month Sales"
            value={formatMoney(calc.thisMonthSales)}
            sub={<><span className="text-foreground">{calc.orderCount}</span> orders · tap to view</>}
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
        <Link to="/taxes" className={cardLink}>
          <StatCard
            tone="yellow"
            label="Tax Reserve"
            value={formatMoney(calc.taxReserve)}
            sub={<><span className="text-foreground">{taxRate}%</span> set aside · tap to view</>}
          />
        </Link>
      </div>

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-4">Sales by Platform</h2>
        {calc.platformSales.map(({ platform, sales }) => (
          <Link to="/orders" className="block" key={platform}>
            <PlatformBar
              label={platform}
              value={sales}
              max={maxPlatform}
              color={PLATFORM_BAR[platform]}
            />
          </Link>
        ))}
      </section>

      <section>
        <h2 className="font-heading text-lg mb-3">Business Snapshot</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/orders?month=All" className="block">
            <MiniCard label="All-Time Sales" value={formatMoneyShort(calc.allTimeSales)} />
          </Link>
          <Link to="/orders?month=All" className={cardLink}>
            <MiniCard label="Items Sold" value={String(calc.itemsSold)} />
          </Link>
          <Link to="/inventory" className={cardLink}>
            <MiniCard label="Order Costs" value={formatMoneyShort(calc.orderCosts)} />
          </Link>
          <Link to="/taxes" className={cardLink}>
            <MiniCard label="Taxable Profit" value={formatMoneyShort(calc.taxableProfitAll)} />
          </Link>
        </div>
      </section>

      <Link
        to="/gallery"
        className="flex items-center justify-between bg-card rounded-3xl p-5 border border-[hsl(var(--border))] active:scale-[0.99] transition-transform"
      >
        <div>
          <p className="font-heading text-lg">My Gallery</p>
          <p className="text-sm text-muted-foreground">Catalog your artwork pieces</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <ImageIcon className="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
      </Link>

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
            <Link
              key={o.id}
              to="/orders"
              className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between active:scale-[0.99] transition-transform"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{o.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {o.platform} · <span className="text-foreground">{formatDate(o.sale_date)}</span>
                </p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="font-heading text-base">{formatMoney(o.sale_total)}</p>
                <p className="text-xs text-foreground">
                  {formatMoney(o.estimated_profit)} profit
                </p>
              </div>
            </Link>
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
            <Link
              key={e.id}
              to="/expenses"
              className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between active:scale-[0.99] transition-transform"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {e.category} · <span className="text-foreground">{formatDate(e.date)}</span>
                </p>
              </div>
              <p className="font-heading text-base ml-3 shrink-0">{formatMoney(e.amount)}</p>
            </Link>
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