import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { calculateUnitCost } from "@/lib/orderCost";
import { toast } from "sonner";
import Field from "@/components/Field";
import { Image } from "@/components/ui/image";

const categories = ["Frame", "Print", "Supply", "Packaging", "Other"];
const sizes = ["4x4", "4x6", "5x7", "8x8", "8x10", "11x14"];

const emptyForm = {
  category: "Frame",
  name: "",
  size: "",
  image_url: "",
  base_item_cost: "",
  paper_ink_cost: "",
  packaging_cost: "",
  quantity_on_hand: "",
  low_stock_level: "",
};

export default function InventoryEditSheet({ open, onClose, record }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isCreate = !record;

  useEffect(() => {
    if (open) {
      if (record) {
        setForm({
          category: record.category || "Frame",
          name: record.name || "",
          size: record.size || "",
          image_url: record.image_url || "",
          base_item_cost: String(record.base_item_cost ?? ""),
          paper_ink_cost: String(record.paper_ink_cost ?? ""),
          packaging_cost: String(record.packaging_cost ?? ""),
          quantity_on_hand: String(record.quantity_on_hand ?? ""),
          low_stock_level: String(record.low_stock_level ?? ""),
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const usesSize = form.category === "Frame" || form.category === "Print";

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("image_url", file_url);
    } catch (err) {
      toast.error("Could not upload photo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (usesSize && !form.size) {
      toast.error("Choose a size");
      return;
    }
    if (!usesSize && !form.name.trim()) {
      toast.error("Enter an item name");
      return;
    }
    if (form.base_item_cost === "" || form.quantity_on_hand === "") {
      toast.error("Enter base cost and quantity");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        name: usesSize ? form.size : form.name.trim(),
        size: usesSize ? form.size : null,
        base_item_cost: Number(form.base_item_cost) || 0,
        paper_ink_cost: Number(form.paper_ink_cost) || 0,
        packaging_cost: Number(form.packaging_cost) || 0,
        quantity_on_hand: Number(form.quantity_on_hand) || 0,
        low_stock_level: Number(form.low_stock_level) || 0,
        image_url: form.image_url || null,
      };
      payload.total_unit_cost = calculateUnitCost(payload);
      if (isCreate) {
        const created = await base44.entities.InventoryCost.create(payload);
        toast.success("Inventory item added");
        base44.functions
          .invoke("appendInventoryToSheet", { inventory_id: created.id })
          .catch(() =>
            toast("Not synced to Google Sheets — connect it in Account")
          );
      } else {
        await base44.entities.InventoryCost.update(record.id, payload);
        toast.success("Inventory updated");
      }
      onClose();
    } catch (err) {
      toast.error(isCreate ? "Could not add inventory" : "Could not update inventory");
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
                {isCreate ? "Add Inventory" : `Edit ${record.name || record.size}`}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Category">
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("category", c)}
                      className={`px-3.5 h-10 rounded-full text-sm font-medium ${
                        form.category === c
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Photo">
                {form.image_url ? (
                  <div className="relative w-full h-40 rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
                    <Image
                      src={form.image_url}
                      fittingType="fit"
                      className="w-full h-full"
                    />
                    <button
                      type="button"
                      onClick={() => set("image_url", "")}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-40 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-muted/40 cursor-pointer">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-sm text-muted-foreground">
                          Add a photo
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhoto}
                    />
                  </label>
                )}
              </Field>

              {usesSize ? (
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
              ) : (
                <Field label="Item Name">
                  <input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Cello tape roll"
                    className="form-input"
                  />
                </Field>
              )}

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
                {saving ? "Saving…" : isCreate ? "Add Item" : "Save Changes"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}