import React, { useEffect, useState } from "react";
import { Check, Pencil, Trash2, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useEntity } from "@/lib/useBusinessData";
import { toast } from "sonner";

// Manage multiple business/brand names per user. Each user owns their records
// (RLS). The active selection is persisted on the user via updateMe so it
// survives sessions. On first load, a legacy single business_name (if present)
// is migrated into a Business record and marked active.
export default function BusinessManager() {
  const { records: businesses, loading, reload } = useEntity("Business", "name");
  const [activeId, setActiveId] = useState(null);
  const [user, setUser] = useState(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    base44.auth
      .me()
      .then((me) => {
        setUser(me);
        setActiveId(me?.active_business_id || me?.data?.active_business_id || null);
      })
      .catch(() => {});
  }, []);

  // One-time migration of the legacy single business_name into a Business record.
  useEffect(() => {
    if (loading || !user || businesses.length > 0) return;
    const legacy = user.business_name || user.data?.business_name;
    if (!legacy) return;
    base44.entities.Business
      .create({ name: legacy })
      .then((rec) => {
        setActiveId(rec.id);
        return base44.auth.updateMe({ active_business_id: rec.id });
      })
      .then(() => reload())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const persistActive = async (id) => {
    setActiveId(id);
    try {
      await base44.auth.updateMe({ active_business_id: id });
    } catch (e) {
      toast.error("Could not set active business");
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const rec = await base44.entities.Business.create({ name });
      setNewName("");
      await reload();
      if (!activeId) await persistActive(rec.id);
      toast.success("Business added");
    } catch (e) {
      toast.error("Could not add business");
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name || !editingId) return;
    try {
      await base44.entities.Business.update(editingId, { name });
      setEditingId(null);
      await reload();
      toast.success("Business updated");
    } catch (e) {
      toast.error("Could not update business");
    }
  };

  const handleDelete = async (b) => {
    try {
      await base44.entities.Business.delete(b.id);
      await reload();
      if (activeId === b.id) {
        const remaining = businesses.filter((x) => x.id !== b.id);
        await persistActive(remaining[0]?.id || null);
      }
      toast.success("Business removed");
    } catch (e) {
      toast.error("Could not delete business");
    }
  };

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <h2 className="font-heading text-lg mb-1">Businesses</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Manage multiple brand names and switch between them.
      </p>

      {loading ? (
        <div className="space-y-2 mb-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {businesses.length === 0 && !user?.business_name && (
            <div className="rounded-2xl p-4 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
              No businesses yet — add your first below.
            </div>
          )}
          {businesses.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] p-3"
            >
              {editingId === b.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className="flex-1 h-10 px-3 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={saveEdit}
                    className="w-10 h-10 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                    aria-label="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0"
                    aria-label="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => persistActive(b.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        activeId === b.id
                          ? "border-[hsl(var(--primary))]"
                          : "border-[hsl(var(--border))]"
                      }`}
                    >
                      {activeId === b.id && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--primary))]" />
                      )}
                    </span>
                    <span className="font-medium text-foreground truncate">{b.name}</span>
                    {activeId === b.id && (
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground shrink-0">
                        Active
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(b.id);
                      setEditName(b.name);
                    }}
                    className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-[hsl(var(--destructive))] active:scale-95 transition-transform"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a business name"
          className="form-input flex-1"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="w-14 h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-60"
          aria-label="Add business"
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
    </section>
  );
}