import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import Field from "@/components/Field";

const DEFAULT_RATE_CENTS = 70; // 70¢/mile

const empty = {
  date: new Date().toISOString().slice(0, 10),
  destination: "",
  purpose: "",
  miles: "",
  rate_cents: DEFAULT_RATE_CENTS,
  notes: "",
};

export default function MileageForm({ open, onClose, record }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        record
          ? {
              date: record.date || new Date().toISOString().slice(0, 10),
              destination: record.destination || "",
              purpose: record.purpose || "",
              miles: record.miles != null ? String(record.miles) : "",
              rate_cents: record.rate != null ? Math.round(record.rate * 100) : DEFAULT_RATE_CENTS,
              notes: record.notes || "",
            }
          : empty
      );
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const deduction = +(
    (Number(form.miles) || 0) *
    (Number(form.rate_cents) || 0) /
    100
  ).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.destination || !form.miles) {
      toast.error("Add a destination and miles");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        destination: form.destination,
        purpose: form.purpose || null,
        miles: Number(form.miles),
        rate: (Number(form.rate_cents) || 0) / 100,
        deduction,
        notes: form.notes || null,
      };
      if (record) {
        await base44.entities.MileageLog.update(record.id, payload);
        toast.success("Trip updated");
      } else {
        await base44.entities.MileageLog.create(payload);
        toast.success("Trip added");
      }
      onClose();
    } catch (err) {
      toast.error("Could not save trip");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await base44.entities.MileageLog.delete(record.id);
      toast.success("Trip deleted");
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
                {record ? "Edit Trip" : "Log Mileage"}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Date">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  className="form-input"
                />
              </Field>
              <Field label="Destination">
                <input
                  value={form.destination}
                  onChange={(e) => set("destination", e.target.value)}
                  placeholder="e.g. Post office"
                  className="form-input"
                />
              </Field>
              <Field label="Business purpose (optional)">
                <input
                  value={form.purpose}
                  onChange={(e) => set("purpose", e.target.value)}
                  placeholder="e.g. Ship orders"
                  className="form-input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Miles">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.miles}
                    onChange={(e) => set("miles", e.target.value)}
                    placeholder="0"
                    className="form-input"
                  />
                </Field>
                <Field label="Rate (¢/mile)">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={form.rate_cents}
                      onChange={(e) => set("rate_cents", e.target.value)}
                      className="form-input pr-10"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      ¢
                    </span>
                  </div>
                </Field>
              </div>
              <div className="bg-muted rounded-2xl p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Deduction</span>
                <span className="font-heading text-lg">${deduction.toFixed(2)}</span>
              </div>
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
                {saving ? "Saving…" : record ? "Update Trip" : "Save Trip"}
              </button>
              {record && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="w-full h-12 rounded-2xl bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" /> Delete Trip
                </button>
              )}
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}