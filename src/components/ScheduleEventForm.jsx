import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const TYPES = ["Deadline", "Market", "Meeting", "Drop", "Other"];

const emptyForm = { title: "", date: "", time: "", type: "Other", notes: "" };

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ScheduleEventForm({ open, onClose, date, event }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        event
          ? { title: "", date: "", time: "", type: "Other", notes: "", ...event }
          : { ...emptyForm, date: date || todayStr() }
      );
    }
  }, [open, event, date]);

  const submit = async () => {
    if (!form.title?.trim()) {
      toast.error("Add a title");
      return;
    }
    if (!form.date) {
      toast.error("Pick a date");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        date: form.date,
        time: form.time || "",
        type: form.type || "Other",
        notes: form.notes || "",
      };
      if (event?.id) {
        await base44.entities.ScheduleEvent.update(event.id, payload);
        toast.success("Event updated");
      } else {
        const created = await base44.entities.ScheduleEvent.create(payload);
        toast.success("Event added");
        try {
          await base44.functions.invoke("pushScheduleEventToCalendar", {
            event_id: created.id,
            title: payload.title,
            date: payload.date,
            time: payload.time,
            type: payload.type,
            notes: payload.notes,
          });
        } catch (e) {}
      }
      onClose();
    } catch (e) {
      toast.error("Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await base44.entities.ScheduleEvent.delete(event.id);
      toast.success("Event deleted");
      onClose();
    } catch (e) {
      toast.error("Could not delete");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-background rounded-t-[2rem] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="w-12 h-1.5 rounded-full bg-[hsl(var(--border))] mx-auto mb-5" />
            <h3 className="font-heading text-2xl mb-4">
              {event?.id ? "Edit event" : "New event"}
            </h3>
            <div className="space-y-3">
              <input
                value={form.title || ""}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title"
                className="form-input"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={form.date || ""}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="form-input"
                />
                <input
                  type="time"
                  value={form.time || ""}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={`px-3 h-9 rounded-full text-sm font-medium shrink-0 ${
                      form.type === t
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes"
                className="form-textarea"
                rows={2}
              />
            </div>
            <div className="flex gap-2 mt-4">
              {event?.id && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="w-12 h-12 rounded-2xl bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] flex items-center justify-center shrink-0 disabled:opacity-60"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={submit}
                disabled={saving}
                className="flex-1 h-12 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}