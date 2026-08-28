import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

export default function LowStockAlert({ records }) {
  const items = (records || [])
    .map((r) => {
      const qty = r.quantity_on_hand || 0;
      const low = r.low_stock_level || 0;
      const out = qty <= 0;
      const lowStock = !out && qty <= low;
      return {
        id: r.id,
        name: r.name || r.size || "Unnamed item",
        qty,
        out,
        lowStock,
      };
    })
    .filter((r) => r.out || r.lowStock);

  if (items.length === 0) return null;
  const outCount = items.filter((i) => i.out).length;

  return (
    <Link
      to="/inventory"
      className="block rounded-3xl border border-rose-200 bg-rose-50 p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
        <p className="font-heading text-base text-rose-900">
          {outCount > 0 ? `${outCount} out of stock` : "Low stock alert"}
        </p>
      </div>
      <p className="text-xs text-rose-700 mb-2.5">
        {items.length} item{items.length === 1 ? "" : "s"} need reordering · tap to review inventory
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 4).map((i) => (
          <span
            key={i.id}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
              i.out ? "bg-rose-600 text-white" : "bg-rose-100 text-rose-800"
            }`}
          >
            {i.name} · {i.out ? "0 left" : `${i.qty} left`}
          </span>
        ))}
        {items.length > 4 && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800">
            +{items.length - 4} more
          </span>
        )}
      </div>
    </Link>
  );
}