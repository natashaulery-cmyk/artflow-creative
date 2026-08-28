import React, { useMemo, useState } from "react";
import { Minus, Plus, Pencil, RefreshCw } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/format";
import { calculateUnitCost as calcUnit } from "@/lib/orderCost";
import { toast } from "sonner";
import InventoryEditSheet from "@/components/InventoryEditSheet";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { Image } from "@/components/ui/image";

export default function Inventory() {
  const { records, loading, reload: reloadInventory } = useEntity("InventoryCost", "-created_date");
  const [editRecord, setEditRecord] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [overrides, setOverrides] = useState({});
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => { await reloadInventory(); };

  const syncFromSheet = async () => {
    setSyncing(true);
    try {
      const me = await base44.auth.me();
      const spreadsheetId = me?.spreadsheet_id || me?.data?.spreadsheet_id;
      if (!spreadsheetId) {
        toast.error("Add your Google Sheet in Account first");
        return;
      }
      const res = await base44.functions.invoke("syncInventoryFromSheets", { spreadsheetId });
      toast.success(`Synced ${res.data?.imported ?? 0} item(s) from your sheet`);
      await reloadInventory();
    } catch (e) {
      toast.error("Sync failed — connect Google Sheets in Account first");
    } finally {
      setSyncing(false);
    }
  };

  const adjustQty = async (rec, delta) => {
    const newQty = Math.max(0, (rec.quantity_on_hand || 0) + delta);
    const prev = overrides[rec.id] || rec;
    setOverrides((o) => ({ ...o, [rec.id]: { ...prev, quantity_on_hand: newQty } }));
    try {
      await base44.entities.InventoryCost.update(rec.id, { quantity_on_hand: newQty });
    } catch (e) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[rec.id];
        return next;
      });
      toast.error("Could not update quantity");
    }
  };

  const openCreate = () => {
    setEditRecord(null);
    setFormOpen(true);
  };

  const openEdit = (rec) => {
    setEditRecord(rec);
    setFormOpen(true);
  };

  const displayRecords = records.map((r) => overrides[r.id] || r);
  const counts = useMemo(() => {
    const c = { All: displayRecords.length, Frame: 0, Print: 0, Packaging: 0, Supply: 0, Other: 0 };
    displayRecords.forEach((r) => {
      const k = r.category || "Frame";
      if (c[k] != null) c[k] += 1;
    });
    return c;
  }, [displayRecords]);
  const filtered = displayRecords.filter(
    (r) => filter === "All" || (r.category || "Frame") === filter
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Inventory" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader
        title="Inventory"
        subtitle="Stock across all categories"
        right={
          <button
            onClick={syncFromSheet}
            disabled={syncing}
            className="shrink-0 h-11 px-4 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center gap-2 text-sm font-medium disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-2">
        {[
          { key: "All", label: "All", count: counts.All },
          { key: "Frame", label: "Frames", count: counts.Frame },
          { key: "Print", label: "Prints", count: counts.Print },
          { key: "Packaging", label: "Packaging", count: counts.Packaging },
        ].map((q) => {
          const active = filter === q.key;
          return (
            <button
              key={q.key}
              onClick={() => setFilter(q.key)}
              className={`flex flex-col items-center justify-center h-16 rounded-2xl border transition-colors ${
                active
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                  : "bg-card text-foreground border-[hsl(var(--border))]"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {q.label}
              </span>
              <span className="text-xl font-heading leading-tight">{q.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {["Supply", "Other"].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              filter === c
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c} · <span className="text-foreground">{counts[c]}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
            No items here — tap + to add inventory
          </div>
        )}
        {filtered.map((rec) => {
          const qty = rec.quantity_on_hand || 0;
          const low = rec.low_stock_level || 0;
          const out = qty <= 0;
          const lowStock = !out && qty <= low;
          const unitCost = calcUnit(rec);
          const title = rec.name || rec.size || "Unnamed item";
          const cat = rec.category || "Frame";
          const cardTone = out
            ? "bg-red-50 border-rose-200"
            : lowStock
            ? "pastel-yellow border-amber-300"
            : "bg-card border-[hsl(var(--border))]";

          return (
            <div
              key={rec.id}
              className={`${cardTone} rounded-3xl p-5 border transition-colors`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  {rec.image_url && (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-[hsl(var(--border))] shrink-0 bg-muted">
                      <Image src={rec.image_url} fittingType="fill" className="w-full h-full" />
                    </div>
                  )}
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-muted text-muted-foreground">
                      {cat}
                    </span>
                    {rec.size && cat !== "Frame" && (
                      <span className="text-[11px] text-black">{rec.size}</span>
                    )}
                  </div>
                  <p className="font-heading text-xl truncate text-black">{title}</p>
                  <p className="text-xs text-foreground">
                    Base {formatMoney(rec.base_item_cost)} · Unit cost {formatMoney(unitCost)}
                  </p>
                  </div>
                </div>
                <button
                  onClick={() => openEdit(rec)}
                  className="w-11 h-11 rounded-full bg-white/70 flex items-center justify-center shrink-0"
                  aria-label="Edit"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                    On Hand
                  </p>
                  <p className="font-heading text-2xl text-black">{qty}</p>
                  {out && (
                    <span className="text-xs font-semibold text-rose-600">Out of stock</span>
                  )}
                  {lowStock && (
                    <span className="text-xs font-semibold text-amber-600">Low stock</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustQty(rec, -1)}
                    className="w-11 h-11 rounded-full bg-white border border-[hsl(var(--border))] flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Decrease"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => adjustQty(rec, 1)}
                    className="w-11 h-11 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Increase"
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add inventory"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <InventoryEditSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        record={editRecord}
      />
    </div>
  );
}