import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { calculateOrderCosts } from "@/lib/orderCost";
import { toast } from "sonner";
import Field from "@/components/Field";

const sizes = ["4x4", "4x6", "5x7", "8x8", "8x10", "11x14"];

const empty = {
  sale_date: new Date().toISOString().slice(0, 10),
  platform: "Vinted",
  order_id: "",
  product_name: "",
  quantity: 1,
  size: "5x7",
  unit_price: "",
  buyer: "",
};

export default function OrderForm({ open, onClose, inventoryCosts }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.unit_price) {
      toast.error("Add product name and sale price");
      return;
    }
    setSaving(true);
    try {
      const inv = inventoryCosts.find((i) => i.size === form.size);
      const costs = calculateOrderCosts(form, inv);
      await base44.entities.Order.create({
        sale_date: form.sale_date,
        platform: form.platform,
        order_id: form.order_id || null,
        product_name: form.product_name,
        quantity: Number(form.quantity),
        size: form.size,
        unit_price: Number(form.unit_price),
        buyer: form.buyer || null,
        ...costs,
      });
      if (inv) {
        const newQty = Math.max(0, (inv.quantity_on_hand || 0) - Number(form.quantity));
        await base44.entities.InventoryCost.update(inv.id, { quantity_on_hand: newQty });
      }
      toast.success("Order added");
      setForm({ ...empty, sale_date: new Date().toISOString().slice(0, 10) });
      onClose();
    } catch (err) {
      toast.error("Could not save order");
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
              <h2 className="font-heading text-2xl text-foreground">Add Order</h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {["Vinted", "Depop"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set("platform", p)}
                    className={`h-12 rounded-2xl font-semibold transition-all ${
                      form.platform === p
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Field label="Product Name">
                <input
                  value={form.product_name}
                  onChange={(e) => set("product_name", e.target.value)}
                  placeholder="e.g. Sunset Print"
                  className="form-input"
                />
              </Field>
              <Field label="Size">
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("size", s)}
                      className={`px-3 h-10 rounded-full text-sm font-medium ${
                        form.size === s
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity">
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    className="form-input"
                  />
                </Field>
                <Field label="Sale Price (each)">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.unit_price}
                      onChange={(e) => set("unit_price", e.target.value)}
                      placeholder="0.00"
                      className="form-input pl-8"
                    />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Order ID (optional)">
                  <input
                    value={form.order_id}
                    onChange={(e) => set("order_id", e.target.value)}
                    className="form-input"
                  />
                </Field>
                <Field label="Buyer (optional)">
                  <input
                    value={form.buyer}
                    onChange={(e) => set("buyer", e.target.value)}
                    className="form-input"
                  />
                </Field>
              </div>
              <Field label="Sale Date">
                <input
                  type="date"
                  value={form.sale_date}
                  onChange={(e) => set("sale_date", e.target.value)}
                  className="form-input"
                />
              </Field>
              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Order"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}