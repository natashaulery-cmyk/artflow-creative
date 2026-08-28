import React, { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import { Image } from "@/components/ui/image";
import ArtPieceForm from "@/components/ArtPieceForm";
import PullToRefresh from "@/components/PullToRefresh";

const statusTone = {
  Available: "bg-emerald-100 text-emerald-700",
  Reserved: "bg-amber-100 text-amber-700",
  Sold: "bg-slate-200 text-slate-600",
  "In Progress": "bg-blue-100 text-blue-700",
};

const filters = ["All", "Available", "Reserved", "Sold", "In Progress"];

export default function Gallery() {
  const { records, loading, reload } = useEntity("ArtPiece", "-created_date");
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState("All");

  const refresh = async () => { await reload(); };

  const openCreate = () => {
    setEdit(null);
    setFormOpen(true);
  };

  const openEdit = (rec) => {
    setEdit(rec);
    setFormOpen(true);
  };

  const counts = filters.reduce((acc, f) => {
    acc[f] = f === "All" ? records.length : records.filter((r) => (r.status || "Available") === f).length;
    return acc;
  }, {});

  const filtered = filter === "All" ? records : records.filter((r) => (r.status || "Available") === filter);

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="font-heading text-[28px]">Gallery</h1>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <header>
        <h1 className="font-heading text-[28px] leading-tight">Gallery</h1>
        <p className="text-muted-foreground text-sm">Your artwork pieces</p>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              filter === f
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-foreground"
            }`}
          >
            {f} · <span className={filter === f ? "" : "text-muted-foreground"}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
          No pieces here — tap + to add your first artwork
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((rec) => (
            <div
              key={rec.id}
              className="bg-card rounded-3xl overflow-hidden border border-[hsl(var(--border))] flex flex-col"
            >
              <div className="relative w-full aspect-square bg-muted">
                {rec.image_url ? (
                  <Image src={rec.image_url} fittingType="fill" className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    statusTone[rec.status || "Available"] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {rec.status || "Available"}
                </span>
                <button
                  onClick={() => openEdit(rec)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
                  aria-label="Edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3">
                <p className="font-heading text-base leading-tight truncate text-black">
                  {rec.title || "Untitled"}
                </p>
                {rec.medium && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {rec.medium}
                  </p>
                )}
                <p className="font-heading text-lg mt-1 text-black">{formatMoney(rec.price)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add piece"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ArtPieceForm open={formOpen} onClose={() => setFormOpen(false)} record={edit} />
    </div>
  );
}