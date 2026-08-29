import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getCurrentBusinessWorkspace } from "@/lib/businessWorkspace";
import { toast } from "sonner";
import Field from "@/components/Field";
import { EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

const empty = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  category: "Art Materials & Supplies",
  amount: "",
  deductible_percent: 100,
  notes: "",
};

export default function ExpenseForm({ open, onClose, record }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        record
          ? {
              date: record.date || new Date().toISOString().slice(0, 10),
              description: record.description || "",
              category: record.category || "Art Materials & Supplies",
              amount: record.amount != null ? String(record.amount) : "",
              deductible_percent: record.deductible_percent ?? 100,
              notes: record.notes || "",
            }
          : empty
      );
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const deductibleAmount = +(
    (Number(form.amount) || 0) *
    (Number(form.deductible_percent) || 0) /
    100
  ).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast.error("Add description and amount");
      return;
    }
    setSaving(true);
    try {
      const workspace = await getCurrentBusinessWorkspace();
      const payload = {
        business_id: record?.business_id || workspace.businessId,
        access_emails: record?.access_emails || workspace.accessEmails,
        date: form.date,
        description: form.description,
        category: form.category,
        amount: Number(form.amount),
        deductible_percent: Number(form.deductible_percent),
        deductible_amount: deductibleAmount,
        notes: form.notes || null,
        source: record?.source || "manual",
      };
      if (record) {
        await base44.entities.Expense.update(record.id, payload);
        toast.success("Expense updated");
      } else {
        await base44.entities.Expense.create(payload);
        toast.success("Expense added");
      }
      onClose();
    } catch (err) {
      toast.error("Could not save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await base44.entities.Expense.delete(record.id);
      toast.success("Expense deleted");
      onClose();
    } catch (err) {
      toast.error("Could not delete");
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
            className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-background rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="w-12 h-1.5 rounded-full bg-[hsl(var(--border))] mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-2xl text-foreground">
                {record ? "Edit Expense" : "Add Expense"}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Description">
                <input
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. Print frames"
                  className="form-input"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={form.category}
                  onValueChange={(v) => set("category", v)}
                >
                  <SelectTrigger className="form-input h-14 font-medium">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => set("amount", e.target.value)}
                      placeholder="0.00"
                      className="form-input pl-8"
                    />
                  </div>
                </Field>
                <Field label="Deductible %">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.deductible_percent}
                      onChange={(e) => set("deductible_percent", e.target.value)}
                      className="form-input pr-8"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      %
                    </span>
                  </div>
                </Field>
              </div>
              <div className="bg-muted rounded-2xl p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Deductible amount</span>
                <span className="font-heading text-lg">${deductibleAmount.toFixed(2)}</span>
              </div>
              <Field label="Date">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="form-input"
                />
              </Field>
              <Field label="Notes (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Additional details"
                  rows={2}
                  className="form-textarea"
                />
              </Field>
              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : record ? "Update Expense" : "Save Expense"}
              </button>
              {record && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="w-full h-12 rounded-2xl bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" /> Delete Expense
                </button>
              )}
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}