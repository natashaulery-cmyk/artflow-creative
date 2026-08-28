import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import Field from "@/components/Field";
import { Image } from "@/components/ui/image";

const statuses = ["Available", "Reserved", "Sold", "In Progress"];

const emptyForm = {
  title: "",
  price: "",
  status: "Available",
  medium: "",
  description: "",
  image_url: "",
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
          price: String(record.price ?? ""),
          status: record.status || "Available",
          medium: record.medium || "",
          description: record.description || "",
          image_url: record.image_url || "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, record]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        price: Number(form.price) || 0,
        status: form.status,
        medium: form.medium.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url || null,
      };
      if (isCreate) {
        await base44.entities.ArtPiece.create(payload);
        toast.success("Piece added to gallery");
      } else {
        await base44.entities.ArtPiece.update(record.id, payload);
        toast.success("Piece updated");
      }
      onClose();
    } catch {
      toast.error(isCreate ? "Could not add piece" : "Could not update piece");
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
                {isCreate ? "Add Piece" : `Edit ${record.title}`}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Photo">
                {form.image_url ? (
                  <div className="relative w-full h-48 rounded-2xl overflow-hidden border border-[hsl(var(--border))]">
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
                  <label className="flex flex-col items-center justify-center w-full h-48 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-muted/40 cursor-pointer">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-sm text-muted-foreground">Add a photo</span>
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

              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Coastal Light No. 3"
                  className="form-input"
                />
              </Field>

              <Field label="Price">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    className="form-input pl-8"
                  />
                </div>
              </Field>

              <Field label="Status">
                <div className="flex flex-wrap gap-2">
                  {statuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("status", s)}
                      className={`px-3.5 h-10 rounded-full text-sm font-medium ${
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

              <Field label="Medium (optional)">
                <input
                  value={form.medium}
                  onChange={(e) => set("medium", e.target.value)}
                  placeholder="e.g. Giclée print, Original painting"
                  className="form-input"
                />
              </Field>

              <Field label="Description (optional)">
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Notes about the piece"
                  rows={3}
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
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}