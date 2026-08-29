import React, { useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import { formatMoney } from "@/lib/format";
import ArtPieceForm from "@/components/ArtPieceForm";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";
import { useModalRoute } from "@/hooks/useModalRoute";
import { Image } from "@/components/ui/image";

const tabs = ["All", "Available", "Sold"];

export default function Gallery() {
  const { records, loading, reload } = useEntity("ArtPiece", "-created_date");
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [mediumFilter, setMediumFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { isOpen: formOpen, open: openForm, close: closeForm } = useModalRoute();
  const [editRecord, setEditRecord] = useState(null);

  const stats = useMemo(() => {
    const available = records.filter((p) => (p.status || "Available") === "Available").length;
    const sold = records.filter((p) => p.status === "Sold").length;
    return { listings: records.length, available, sold };
  }, [records]);

  const mediums = useMemo(
    () => [...new Set(records.map((p) => p.medium).filter(Boolean))].sort(),
    [records]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((p) => {
      if (filter !== "All" && (p.status || "Available") !== filter) return false;
      if (mediumFilter !== "All" && p.medium !== mediumFilter) return false;
      if (!q) return true;
      return `${p.title || ""} ${p.medium || ""} ${p.size || ""} ${p.platform || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, filter, mediumFilter, search]);

  const openCreate = () => {
    setEditRecord(null);
    openForm();
  };

  const openEdit = (record) => {
    setEditRecord(record);
    openForm();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Gallery" />
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PullToRefresh onRefresh={reload} />
      <PageHeader title="Gallery" onBack={() => navigate(-1)} />

      <section className="bg-background border-b border-[hsl(var(--border))] pb-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-black text-white flex items-center justify-center font-bold text-2xl shrink-0">
            AF
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight truncate">Art Flow Creative</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Affordable framed art & prints</p>
            <div className="flex gap-5 mt-3">
              <div>
                <p className="font-bold text-sm">{stats.listings}</p>
                <p className="text-[11px] text-muted-foreground">Listings</p>
              </div>
              <div>
                <p className="font-bold text-sm">{stats.available}</p>
                <p className="text-[11px] text-muted-foreground">Available</p>
              </div>
              <div>
                <p className="font-bold text-sm">{stats.sold}</p>
                <p className="text-[11px] text-muted-foreground">Sold</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex border-b border-[hsl(var(--border))]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 h-11 text-sm font-semibold border-b-2 transition-colors ${
              filter === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shop"
            className="w-full h-11 pl-10 pr-3 rounded-none bg-muted/60 border-0 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          className="w-11 h-11 flex items-center justify-center border border-[hsl(var(--border))]"
          aria-label="Filter artwork"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {filtersOpen && mediums.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {["All", ...mediums].map((medium) => (
            <button
              key={medium}
              onClick={() => setMediumFilter(medium)}
              className={`px-3.5 h-9 border text-xs font-medium shrink-0 ${
                mediumFilter === medium
                  ? "border-foreground bg-foreground text-background"
                  : "border-[hsl(var(--border))] bg-background text-foreground"
              }`}
            >
              {medium === "All" ? "All mediums" : medium}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[hsl(var(--border))]">
          <p className="font-semibold">No artwork here yet</p>
          <p className="text-sm text-muted-foreground mt-1">Tap + to add a listing</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-1.5 gap-y-5">
          {filtered.map((piece) => {
            const sold = piece.status === "Sold";
            return (
              <button key={piece.id} onClick={() => openEdit(piece)} className="text-left min-w-0">
                <div className="relative aspect-square bg-muted overflow-hidden">
                  {piece.image_url ? (
                    <Image src={piece.image_url} fittingType="fill" className="w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      No photo
                    </div>
                  )}
                  {sold && (
                    <span className="absolute left-2 top-2 bg-black text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                      Sold
                    </span>
                  )}
                </div>
                <div className="pt-2 px-0.5">
                  <p className="text-sm leading-tight truncate text-foreground">{piece.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {[piece.size, piece.medium].filter(Boolean).join(" · ") || "Art print"}
                  </p>
                  <p className="text-sm font-bold mt-1.5 text-foreground">
                    {formatMoney(sold ? piece.sale_price || piece.price : piece.price)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-black text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform z-30"
        style={{ left: "50%", transform: "translateX(calc(50vw - 2.75rem - 1.25rem))" }}
        aria-label="Add artwork"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      <ArtPieceForm open={formOpen} onClose={closeForm} record={editRecord} />
    </div>
  );
}
