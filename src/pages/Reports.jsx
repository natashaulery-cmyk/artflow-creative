import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

function inMonth(d, year, month) {
  const date = new Date(d);
  return date.getFullYear() === year && date.getMonth() === month;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export default function Reports() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Transaction.list("-date", 500);
        setTransactions(data);
      } catch {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const prevCursor = useMemo(() => {
    const d = new Date(cursor.year, cursor.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [cursor]);

  const monthData = useMemo(() => {
    const dim = daysInMonth(cursor.year, cursor.month);
    const buckets = Array.from({ length: dim }, (_, i) => ({ day: i + 1, profit: 0 }));
    transactions.forEach((t) => {
      if (!inMonth(t.date, cursor.year, cursor.month)) return;
      const day = new Date(t.date).getDate();
      buckets[day - 1].profit += t.type === "income" ? Number(t.amount) : -Number(t.amount);
    });
    return buckets;
  }, [transactions, cursor]);

  const monthTotal = monthData.reduce((s, d) => s + d.profit, 0);

  const prevTotal = useMemo(() => {
    return transactions
      .filter((t) => inMonth(t.date, prevCursor.year, prevCursor.month))
      .reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  }, [transactions, prevCursor]);

  const change = prevTotal !== 0 ? ((monthTotal - prevTotal) / Math.abs(prevTotal)) * 100 : 0;

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const shift = (delta) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Monthly profit snapshot</p>
      </header>

      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="w-11 h-11 rounded-full bg-muted text-foreground font-heading text-lg active:scale-95 transition-transform">‹</button>
        <p className="font-heading text-lg text-foreground">{monthLabel}</p>
        <button onClick={() => shift(1)} className="w-11 h-11 rounded-full bg-muted text-foreground font-heading text-lg active:scale-95 transition-transform">›</button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="pastel-lavender rounded-3xl p-5"
      >
        <p className="text-sm text-[hsl(var(--primary))] mb-1">Net Profit — {monthLabel.split(" ")[0]}</p>
        <p className={`text-4xl font-heading ${monthTotal >= 0 ? "text-foreground" : "text-rose-600"}`}>
          {monthTotal >= 0 ? "+" : "-"}${Math.abs(monthTotal).toFixed(2)}
        </p>
        {prevTotal !== 0 && (
          <p className={`text-sm mt-2 ${change >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs last month
          </p>
        )}
      </motion.div>

      <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <p className="text-sm font-medium text-muted-foreground mb-4">Daily Profit Breakdown</p>
        {loading ? (
          <div className="h-48 bg-muted rounded-2xl animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", fontSize: 12 }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "Profit"]}
                labelFormatter={(d) => `Day ${d}`}
              />
              <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                {monthData.map((entry, i) => (
                  <Cell key={i} fill={entry.profit >= 0 ? "#B8E6C9" : "#F9C5C5"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="pastel-blue rounded-3xl p-5">
          <p className="text-xs text-sky-700/80 font-semibold uppercase tracking-wide">Last Month</p>
          <p className="text-2xl font-heading text-sky-900 mt-1">${Math.abs(prevTotal).toFixed(2)}</p>
        </div>
        <div className="pastel-yellow rounded-3xl p-5">
          <p className="text-xs text-amber-700/80 font-semibold uppercase tracking-wide">This Month</p>
          <p className="text-2xl font-heading text-amber-900 mt-1">${Math.abs(monthTotal).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}