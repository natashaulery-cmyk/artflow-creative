import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { calculateUnitCost } from "@/lib/orderCost";
import { toast } from "sonner";
import Field from "@/components/Field";

export default function InventoryEditSheet({ open, onClose, record }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && record) {
      setForm({
        base_item_cost: String(record.base_item_cost ?? ""),
        paper_ink_cost: String(record.paper_ink_cost ?? ""),
        packaging_cost: String(record.packaging_cost ?? ""),
        quantity_on_hand: String(record.quantity_on_hand ?? ""),
        low_stock_level: String(record.low_stock_level ?? ""),
      });
    }
  }, [open, record]);

  if (!record) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        base_item_cost: Number(form.base_item_cost) || 0,
        paper_ink_cost: Number(form.paper_ink_cost) || 0,
        packaging_cost: Number(form.packaging_cost) || 0,
        quantity_on_hand: Number(form.quantity_on_hand) || 0,
        low_stock_level: Number(form.low_stock_level) || 0,
      };
      payload.total_unit_cost = calculateUnitCost(payload);
      await base44.entities.InventoryCost.update(record.id, payload);
      toast.success("Inventory updated");
      onClose();
    } catch (err) {
      toast.error("Could not update inventory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && form && (
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
              <h2 className="font-heading text-2xl text-foreground">Edit {record.size}</h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Quantity on Hand">
                <input
                  type="number"
                  min="0"
                  value={form.quantity_on_hand}
                  onChange={(e) => set("quantity_on_hand", e.target.value)}
                  className="form-input"
                />
              </Field>
              <Field label="Base Item Cost">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.base_item_cost}
                    onChange={(e) => set("base_item_cost", e.target.value)}
                    className="form-input pl-8"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Paper + Ink">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.paper_ink_cost}
                      onChange={(e) => set("paper_ink_cost", e.target.value)}
                      className="form-input pl-8"
                    />
                  </div>
                </Field>
                <Field label="Packaging">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.packaging_cost}
                      onChange={(e) => set("packaging_cost", e.target.value)}
                      className="form-input pl-8"
                    />
                  </div>
                </Field>
              </div>
              <Field label="Low-Stock Level">
                <input
                  type="number"
                  min="0"
                  value={form.low_stock_level}
                  onChange={(e) => set("low_stock_level", e.target.value)}
                  className="form-input"
                />
              </Field>
              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}