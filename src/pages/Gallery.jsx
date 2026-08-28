import React, { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney, formatDate } from "@/lib/format";
import ArtPieceForm from "@/components/ArtPieceForm";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useModalRoute } from "@/hooks/useModalRoute";
import { Image } from "@/components/ui/image";

const tabs = ["All", "Available", "Sold"];

export default function Gallery() {
  const { records, loading, reload } = useEntity("ArtPiece", "-created_date");
  const [filter, setFilter] = useState("All");
  const [mediumFilter, setMediumFilter] = useState("All");
  const [search, setSearch] = useState("");
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);

  const refresh = async () => { await reload(); };

  const stats = useMemo(() => {
    const available = records.filter((p) => (p.status || "Available") === "Available").length;
    const sold = records.filter((p) => p.status === "Sold");
    const revenue = sold.reduce((s, p) => s + (p.sale_price || p.price || 0), 0);
    return { total: records.length, available, soldCount: sold.length, revenue };
  }, [records]);

  const mediums = useMemo(() => {
    const set = new Set();
    records.forEach((p) => {
      if (p.medium) set.add(p.medium);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((p) => {
      if (filter !== "All" && (p.status || "Available") !== filter) return false;
      if (mediumFilter !== "All" && (p.medium || "") !== mediumFilter) return false;
      if (!q) return true;
      return `${p.title || ""} ${p.medium || ""} ${p.size || ""} ${p.platform || ""} ${p.buyer || ""} ${p.notes || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, filter, mediumFilter, search]);

  const openCreate = () => {
    setEditRecord(null);
    openForm();
  };

  const openEdit = (rec) => {
    setEditRecord(rec);
    openForm();
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Gallery" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={refresh} />
      <PageHeader title="Gallery" subtitle="Your artwork collection" />

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Pieces</p>
          <p className="font-heading text-2xl mt-1 text-foreground">{stats.total}</p>
        </div>
        <div className="pastel-mint rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Available</p>
          <p className="font-heading text-2xl mt-1 text-foreground">{stats.available}</p>
        </div>
        <div className="pastel-lavender rounded-2xl p-4 border border-[hsl(var(--border))]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Sold</p>
          <p className="font-heading text-2xl mt-1 text-foreground">{stats.soldCount}</p>
        </div>
      </div>

      {stats.soldCount > 0 && (
        <div className="pastel-peach rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Gallery Revenue
          </span>
          <span className="font-heading text-xl text-foreground">{formatMoney(stats.revenue)}</span>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or category"
          className="form-input pl-11"
        />
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`flex-1 h-10 rounded-full text-sm font-medium ${
              filter === t
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {mediums.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          <button
            onClick={() => setMediumFilter("All")}
            className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
              mediumFilter === "All"
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            All mediums
          </button>
          {mediums.map((m) => (
            <button
              key={m}
              onClick={() => setMediumFilter(m)}
              className={`px-4 h-9 rounded-full text-sm font-medium shrink-0 ${
                mediumFilter === m
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
          No artwork here — tap + to add a piece
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((p) => {
          const sold = p.status === "Sold";
          return (
            <button
              key={p.id}
              onClick={() => openEdit(p)}
              className="text-left bg-card rounded-3xl overflow-hidden border border-[hsl(var(--border))] active:scale-[0.98] transition-transform"
            >
              <div className="relative w-full aspect-square bg-muted">
                {p.image_url ? (
                  <Image src={p.image_url} fittingType="fill" className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    sold
                      ? "bg-emerald-600 text-white"
                      : "bg-white/90 text-[hsl(var(--primary))]"
                  }`}
                >
                  {sold ? "Sold" : "Available"}
                </span>
              </div>
              <div className="p-3">
                <p className="font-medium text-sm truncate text-foreground">{p.title}</p>
                {p.size && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{p.size}</p>
                )}
                <p className="font-heading text-base mt-1 text-foreground">
                  {formatMoney(sold ? p.sale_price || p.price : p.price)}
                </p>
                {sold && p.sale_date && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Sold {formatDate(p.sale_date)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/40 flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add artwork"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ArtPieceForm
        open={formOpen}
        onClose={closeForm}
        record={editRecord}
      />
    </div>
  );
}