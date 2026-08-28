import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

function isToday(d) {
  const t = new Date();
  const date = new Date(d);
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
  );
}

export default function Home() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Transaction.list("-date", 200);
        setTransactions(data);
      } catch {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = transactions.filter((t) => isToday(t.date));
  const revenue = today.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expenses = today.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = revenue - expenses;

  const recent = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="font-heading text-3xl text-foreground mt-0.5">Studio Dashboard</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="pastel-mint rounded-3xl p-5"
        >
          <div className="flex items-center gap-1.5 text-emerald-700/80 mb-3">
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Revenue</span>
          </div>
          <p className="text-3xl font-heading text-emerald-800">${revenue.toFixed(2)}</p>
          <p className="text-xs text-emerald-700/70 mt-1">today</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="pastel-peach rounded-3xl p-5"
        >
          <div className="flex items-center gap-1.5 text-rose-700/80 mb-3">
            <ArrowDownRight className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Expenses</span>
          </div>
          <p className="text-3xl font-heading text-rose-800">${expenses.toFixed(2)}</p>
          <p className="text-xs text-rose-700/70 mt-1">today</p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Net Profit Today</p>
            <p className={`text-4xl font-heading mt-1 ${net >= 0 ? "text-foreground" : "text-rose-600"}`}>
              {net >= 0 ? "+" : "-"}${Math.abs(net).toFixed(2)}
            </p>
          </div>
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              net >= 0 ? "pastel-mint" : "pastel-peach"
            }`}
          >
            {net >= 0 ? (
              <TrendingUp className="w-6 h-6 text-emerald-700" />
            ) : (
              <TrendingDown className="w-6 h-6 text-rose-700" />
            )}
          </div>
        </div>
      </motion.div>

      <div>
        <h2 className="font-heading text-xl text-foreground mb-3">Recent Activity</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="pastel-lavender rounded-3xl p-8 text-center">
            <p className="text-muted-foreground text-sm">No transactions yet. Tap the + button to log your first one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div
                key={t.id}
                className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      t.type === "income" ? "pastel-mint" : "pastel-peach"
                    }`}
                  >
                    {t.type === "income" ? (
                      <ArrowUpRight className="w-5 h-5 text-emerald-700" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5 text-rose-700" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{t.category}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.description || new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
                <p className={`font-heading text-lg ${t.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                  {t.type === "income" ? "+" : "-"}${Number(t.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}