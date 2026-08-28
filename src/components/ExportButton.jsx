import React, { useState, useRef, useEffect } from "react";
import { Download, ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/format";

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvCell(c.get(r))).join(","))
    .join("\r\n");
  // BOM keeps Excel happy with UTF-8
  return "\uFEFF" + header + "\r\n" + body + "\r\n";
}

function triggerDownload(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const salesColumns = [
  { label: "Sale Date", get: (r) => r.sale_date || "" },
  { label: "Platform", get: (r) => r.platform || "" },
  { label: "Order ID", get: (r) => r.order_id || "" },
  { label: "Product", get: (r) => r.product_name || "" },
  { label: "Qty", get: (r) => r.quantity || "" },
  { label: "Size", get: (r) => r.size || "" },
  { label: "Unit Price", get: (r) => (r.unit_price ?? "") },
  { label: "Sale Total", get: (r) => (r.sale_total ?? "") },
  { label: "Buyer", get: (r) => r.buyer || "" },
  { label: "Total Cost", get: (r) => (r.total_cost ?? "") },
  { label: "Est. Profit", get: (r) => (r.estimated_profit ?? "") },
];

const expenseColumns = [
  { label: "Date", get: (r) => r.date || "" },
  { label: "Category", get: (r) => r.category || "" },
  { label: "Description", get: (r) => r.description || "" },
  { label: "Amount", get: (r) => (r.amount ?? "") },
  { label: "Deductible %", get: (r) => (r.deductible_percent ?? "") },
  { label: "Deductible Amount", get: (r) => (r.deductible_amount ?? "") },
  { label: "Source", get: (r) => r.source || "" },
  { label: "Notes", get: (r) => r.notes || "" },
];

export default function ExportButton({ orders, expenses }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  };

  const exportSales = () => {
    const rows = [...orders].sort((a, b) => (a.sale_date || "").localeCompare(b.sale_date || ""));
    triggerDownload(`sales-${stamp()}.csv`, buildCsv(salesColumns, rows));
    setOpen(false);
  };

  const exportExpenses = () => {
    const rows = [...expenses].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    triggerDownload(`expenses-${stamp()}.csv`, buildCsv(expenseColumns, rows));
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-10 px-3 rounded-2xl bg-card border border-[hsl(var(--border))] flex items-center gap-1.5 text-sm font-medium shrink-0"
      >
        <Download className="w-4 h-4" /> Export
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-52 bg-card rounded-2xl border border-[hsl(var(--border))] shadow-lg overflow-hidden">
          <button
            onClick={exportSales}
            className="w-full text-left px-4 py-3 text-sm hover:bg-muted flex items-center justify-between"
          >
            <span>Sales history</span>
            <span className="text-xs text-muted-foreground">{orders.length}</span>
          </button>
          <div className="h-px bg-[hsl(var(--border))]" />
          <button
            onClick={exportExpenses}
            className="w-full text-left px-4 py-3 text-sm hover:bg-muted flex items-center justify-between"
          >
            <span>Expense history</span>
            <span className="text-xs text-muted-foreground">{expenses.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}