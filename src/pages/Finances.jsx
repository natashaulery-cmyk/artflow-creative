import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Bell, CalendarClock, Check, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import jsPDF from "jspdf";

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Finances() {
  const [tab, setTab] = useState("invoices");
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [swipedId, setSwipedId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, exp] = await Promise.all([
          base44.entities.Invoice.list("-due_date", 100),
          base44.entities.Expense.list("-due_date", 100),
        ]);
        setInvoices(inv);
        setExpenses(exp);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const markPaid = async (id) => {
    try {
      const updated = await base44.entities.Invoice.update(id, { status: "paid" });
      setInvoices((prev) => prev.map((i) => (i.id === id ? updated : i)));
      toast.success("Invoice marked paid");
    } catch {
      toast.error("Could not update invoice");
    }
  };

  const generateReminder = (inv) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("Payment Reminder", 20, 30);
    doc.setFontSize(12);
    doc.text(`Dear ${inv.client_name},`, 20, 50);
    doc.text(`This is a friendly reminder that your invoice of $${Number(inv.amount).toFixed(2)} is due ${new Date(inv.due_date).toLocaleDateString()}.`, 20, 65);
    if (inv.description) doc.text(`Details: ${inv.description}`, 20, 80);
    doc.text("Thank you for your prompt payment.", 20, 100);
    doc.text("— Your Artist Studio", 20, 115);
    doc.save(`reminder-${inv.client_name.replace(/\s/g, "-")}.pdf`);
    toast.success("Reminder PDF downloaded");
  };

  const toggleExpensePaid = async (exp) => {
    try {
      const updated = await base44.entities.Expense.update(exp.id, { paid: !exp.paid });
      setExpenses((prev) => prev.map((e) => (e.id === exp.id ? updated : e)));
    } catch {
      toast.error("Could not update expense");
    }
  };

  const unpaid = invoices.filter((i) => i.status === "unpaid").sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const paid = invoices.filter((i) => i.status === "paid");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl text-foreground">Finances</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Invoices & recurring bills</p>
      </header>

      <div className="bg-muted rounded-full p-1 flex">
        <button
          onClick={() => setTab("invoices")}
          className={`flex-1 h-11 rounded-full text-sm font-semibold transition-all ${
            tab === "invoices" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setTab("expenses")}
          className={`flex-1 h-11 rounded-full text-sm font-semibold transition-all ${
            tab === "expenses" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Expenses
        </button>
      </div>

      {tab === "invoices" ? (
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-24 rounded-3xl bg-muted animate-pulse" />)
          ) : unpaid.length === 0 && paid.length === 0 ? (
            <div className="pastel-lavender rounded-3xl p-10 text-center">
              <FileText className="w-8 h-8 mx-auto text-[hsl(var(--primary))] mb-2" />
              <p className="text-muted-foreground text-sm">No invoices yet.</p>
            </div>
          ) : (
            <>
              {unpaid.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</p>
              )}
              {unpaid.map((inv) => {
                const days = daysUntil(inv.due_date);
                return (
                  <motion.div
                    key={inv.id}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.4}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -80) {
                        markPaid(inv.id);
                      }
                      setSwipedId(null);
                    }}
                    onDragStart={() => setSwipedId(inv.id)}
                    className="relative"
                  >
                    <div className="absolute inset-0 pastel-mint rounded-3xl flex items-center justify-end pr-6">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                        <Check className="w-5 h-5" /> Mark Paid
                      </div>
                    </div>
                    <motion.div
                      className="relative bg-card rounded-3xl p-4 border border-[hsl(var(--border))] flex items-center justify-between"
                      animate={{ opacity: swipedId === inv.id ? 0.92 : 1 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full pastel-peach flex items-center justify-center">
                          <FileText className="w-5 h-5 text-rose-700" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{inv.client_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {days >= 0 ? ` · ${days}d left` : ` · ${Math.abs(days)}d overdue`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-heading text-lg text-foreground">${Number(inv.amount).toFixed(0)}</p>
                        <button
                          onClick={() => generateReminder(inv)}
                          className="text-[11px] text-[hsl(var(--primary))] font-medium flex items-center gap-1 mt-0.5"
                        >
                          <Bell className="w-3 h-3" /> Reminder
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}

              {paid.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Paid</p>
                  {paid.map((inv) => (
                    <div key={inv.id} className="bg-muted/60 rounded-3xl p-4 flex items-center justify-between opacity-70">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full pastel-mint flex items-center justify-center">
                          <Check className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground line-through">{inv.client_name}</p>
                          <p className="text-xs text-muted-foreground">Paid</p>
                        </div>
                      </div>
                      <p className="font-heading text-lg text-muted-foreground">${Number(inv.amount).toFixed(0)}</p>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-20 rounded-3xl bg-muted animate-pulse" />)
          ) : expenses.length === 0 ? (
            <div className="pastel-blue rounded-3xl p-10 text-center">
              <CalendarClock className="w-8 h-8 mx-auto text-sky-700 mb-2" />
              <p className="text-muted-foreground text-sm">No recurring expenses tracked yet.</p>
            </div>
          ) : (
            expenses
              .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
              .map((exp) => {
                const days = daysUntil(exp.due_date);
                const urgent = days <= 3 && days >= 0 && !exp.paid;
                return (
                  <div
                    key={exp.id}
                    className={`rounded-3xl p-4 border flex items-center justify-between ${
                      exp.paid ? "bg-muted/60 opacity-70 border-[hsl(var(--border))]" : urgent ? "pastel-peach border-rose-200" : "bg-card border-[hsl(var(--border))]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleExpensePaid(exp)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          exp.paid ? "pastel-mint" : "bg-muted border border-[hsl(var(--border))]"
                        }`}
                      >
                        {exp.paid && <Check className="w-5 h-5 text-emerald-700" />}
                      </button>
                      <div>
                        <p className={`font-medium text-foreground ${exp.paid ? "line-through" : ""}`}>{exp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {exp.recurrence === "monthly" ? "Monthly · " : "One-time · "}
                          {exp.paid ? "Paid" : days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                        </p>
                      </div>
                    </div>
                    <p className="font-heading text-lg text-foreground">${Number(exp.amount).toFixed(0)}</p>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}