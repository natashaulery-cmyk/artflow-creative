import React, { useState } from "react";
import { Minus, Plus, Pencil } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/orderCost";
import { calculateUnitCost as calcUnit } from "@/lib/orderCost";
import { toast } from "sonner";
import InventoryEditSheet from "@/components/InventoryEditSheet";

export default function Inventory() {
  const { records, loading } = useEntity("InventoryCost", "size");
  const [editRecord, setEditRecord] = useState(null);

  const adjustQty = async (rec, delta) => {
    const newQty = Math.max(0, (rec.quantity_on_hand || 0) + delta);
    try {
      await base44.entities.InventoryCost.update(rec.id, { quantity_on_hand: newQty });
    } catch (e) {
      toast.error("Could not update quantity");
    }
  };

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
        <p className="text-muted-foreground text-sm">Print & frame stock by size</p>
      </header>

      <div className="space-y-3">
        {records.map((rec) => {
          const qty = rec.quantity_on_hand || 0;
          const low = rec.low_stock_level || 0;
          const out = qty <= 0;
          const lowStock = !out && qty <= low;
          const unitCost = calcUnit(rec);
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
                <div>
                  <p className="font-heading text-xl">{rec.size}</p>
                  <p className="text-xs text-muted-foreground">
                    Base {formatMoney(rec.base_item_cost)} · Unit cost {formatMoney(unitCost)}
                  </p>
                </div>
                <button
                  onClick={() => setEditRecord(rec)}
                  className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center"
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

      <InventoryEditSheet
        open={!!editRecord}
        onClose={() => setEditRecord(null)}
        record={editRecord}
      />
    </div>
  );
}