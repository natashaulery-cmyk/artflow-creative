import React, { useState } from "react";
import { Minus, Plus, Pencil } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/format";
import { calculateUnitCost as calcUnit } from "@/lib/orderCost";
import { toast } from "sonner";
import InventoryEditSheet from "@/components/InventoryEditSheet";

const categoryFilters = ["All", "Frame", "Print", "Supply", "Packaging", "Other"];

export default function Inventory() {
  const { records, loading } = useEntity("InventoryCost", "-created_date");
  const [editRecord, setEditRecord] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState("All");

  const adjustQty = async (rec, delta) => {
    const newQty = Math.max(0, (rec.quantity_on_hand || 0) + delta);
    try {
      await base44.entities.InventoryCost.update(rec.id, { quantity_on_hand: newQty });
    } catch (e) {
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

  const filtered = records.filter(
    (r) => filter === "All" || (r.category || "Frame") === filter
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="font-heading text-[28px]">Inventory</h1>
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
      <header>
        <h1 className="font-heading text-[28px] leading-tight">Inventory</h1>
        <p className="text-muted-foreground text-sm">Stock across all categories</p>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {categoryFilters.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              filter === c
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c}
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-muted text-muted-foreground">
                      {cat}
                    </span>
                    {rec.size && cat !== "Frame" && (
                      <span className="text-[11px] text-muted-foreground">{rec.size}</span>
                    )}
                  </div>
                  <p className="font-heading text-xl truncate">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    Base {formatMoney(rec.base_item_cost)} · Unit cost {formatMoney(unitCost)}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(rec)}
                  className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center shrink-0"
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
                  <p className="font-heading text-2xl">{qty}</p>
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