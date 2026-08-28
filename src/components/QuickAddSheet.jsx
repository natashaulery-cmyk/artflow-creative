import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const categories = ["Sale", "Supplies", "Studio Rent", "Commission", "Shipping", "Exhibition", "Other"];

export default function QuickAddSheet({ open, onClose }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Supplies");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("expense");
    setAmount("");
    setCategory("Supplies");
    setDate(new Date().toISOString().slice(0, 10));
    setDescription("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Transaction.create({
        amount: Number(amount),
        type,
        category,
        date,
        description,
      });
      toast.success("Transaction logged");
      reset();
      onClose();
    } catch (err) {
      toast.error("Could not save transaction");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-background rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="w-12 h-1.5 rounded-full bg-[hsl(var(--border))] mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-2xl text-foreground">Quick Add</h2>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("income")}
                  className={`h-14 rounded-2xl font-semibold text-base transition-all ${
                    type === "income"
                      ? "pastel-mint text-emerald-700 ring-2 ring-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`h-14 rounded-2xl font-semibold text-base transition-all ${
                    type === "expense"
                      ? "pastel-peach text-rose-700 ring-2 ring-rose-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Expense
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-heading text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-16 pl-10 pr-4 rounded-2xl bg-card border border-input text-3xl font-heading focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`px-4 h-11 rounded-full text-sm font-medium transition-all ${
                        category === c
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl bg-card border border-input text-base focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional note"
                  className="w-full h-14 px-4 rounded-2xl bg-card border border-input text-base focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg shadow-lg shadow-[hsl(var(--primary))]/30 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Transaction"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}