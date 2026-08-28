import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import Field from "@/components/Field";
import { Image } from "@/components/ui/image";

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  title: "",
  image_url: "",
  medium: "",
  size: "",
  price: "",
  status: "Available",
  sale_price: "",
  sale_date: "",
  buyer: "",
  platform: "",
  notes: "",
};

export default function ArtPieceForm({ open, onClose, record }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isCreate = !record;

  useEffect(() => {
    if (open) {
      if (record) {
        setForm({
          title: record.title || "",
          image_url: record.image_url || "",
          medium: record.medium || "",
          size: record.size || "",
          price: String(record.price ?? ""),
          status: record.status || "Available",
          sale_price: String(record.sale_price ?? ""),
          sale_date: record.sale_date || "",
          buyer: record.buyer || "",
          platform: record.platform || "",
          notes: record.notes || "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isSold = form.status === "Sold";

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("image_url", file_url);
    } catch {
      toast.error("Could not upload photo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const markSold = () => {
    setForm((f) => ({
      ...f,
      status: "Sold",
      sale_date: f.sale_date || today(),
      sale_price: f.sale_price || f.price,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Enter a title");
      return;
    }
    if (form.price === "") {
      toast.error("Enter a price");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        image_url: form.image_url || null,
        medium: form.medium.trim() || null,
        size: form.size.trim() || null,
        price: Number(form.price) || 0,
        status: form.status,
        sale_price: isSold ? Number(form.sale_price) || Number(form.price) || 0 : null,
        sale_date: isSold ? form.sale_date || null : null,
        buyer: isSold ? form.buyer.trim() || null : null,
        platform: isSold ? form.platform.trim() || null : null,
        notes: form.notes.trim() || null,
      };
      if (isCreate) {
        await base44.entities.ArtPiece.create(payload);
        toast.success("Artwork added to gallery");
      } else {
        await base44.entities.ArtPiece.update(record.id, payload);
        toast.success("Artwork updated");
      }
      onClose();
    } catch {
      toast.error(isCreate ? "Could not add artwork" : "Could not update artwork");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await base44.entities.ArtPiece.delete(record.id);
      toast.success("Artwork removed");
      onClose();
    } catch {
      toast.error("Could not delete artwork");
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
                {isCreate ? "Add Artwork" : "Edit Artwork"}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {!isCreate && form.status === "Available" && (
              <button
                type="button"
                onClick={markSold}
                className="w-full h-12 mb-4 rounded-2xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <CheckCircle2 className="w-5 h-5" /> Mark as Sold
              </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Photo">
                {form.image_url ? (
                  <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
                    <Image src={form.image_url} fittingType="fit" className="w-full h-full" />
                    <button
                      type="button"
                      onClick={() => set("image_url", "")}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-44 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-muted/40 cursor-pointer">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-sm text-muted-foreground">Add a photo</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </label>
                )}
              </Field>

              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Sunset Print 8x10"
                  className="form-input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Medium">
                  <input
                    value={form.medium}
                    onChange={(e) => set("medium", e.target.value)}
                    placeholder="Giclee print"
                    className="form-input"
                  />
                </Field>
                <Field label="Size">
                  <input
                    value={form.size}
                    onChange={(e) => set("size", e.target.value)}
                    placeholder="8x10"
                    className="form-input"
                  />
                </Field>
              </div>

              <Field label="Price">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    className="form-input pl-8"
                  />
                </div>
              </Field>

              <Field label="Status">
                <div className="flex gap-2">
                  {["Available", "Sold"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("status", s)}
                      className={`flex-1 h-11 rounded-2xl text-sm font-medium ${
                        form.status === s
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              {isSold && (
                <div className="space-y-4 rounded-2xl bg-muted/40 p-4 border border-[hsl(var(--border))]">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sale Price">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={form.sale_price}
                          onChange={(e) => set("sale_price", e.target.value)}
                          className="form-input pl-8"
                        />
                      </div>
                    </Field>
                    <Field label="Sale Date">
                      <input
                        type="date"
                        value={form.sale_date}
                        onChange={(e) => set("sale_date", e.target.value)}
                        className="form-input"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Buyer">
                      <input
                        value={form.buyer}
                        onChange={(e) => set("buyer", e.target.value)}
                        placeholder="Optional"
                        className="form-input"
                      />
                    </Field>
                    <Field label="Platform">
                      <input
                        value={form.platform}
                        onChange={(e) => set("platform", e.target.value)}
                        placeholder="Etsy, In person…"
                        className="form-input"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Optional"
                  rows={2}
                  className="form-textarea"
                />
              </Field>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : isCreate ? "Add to Gallery" : "Save Changes"}
              </button>

              {!isCreate && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="w-full h-12 rounded-2xl bg-muted text-[hsl(var(--destructive))] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Trash2 className="w-4 h-4" /> Remove from Gallery
                </button>
              )}
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}