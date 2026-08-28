import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { toast } from "sonner";

const statusConfig = {
  available: { bg: "pastel-mint", text: "text-emerald-700", label: "Available", icon: Check },
  sold: { bg: "pastel-peach", text: "text-rose-700", label: "Sold", icon: Check },
  reserved: { bg: "pastel-yellow", text: "text-amber-700", label: "Reserved", icon: Clock },
};

export default function InventoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.InventoryItem.get(id);
        setItem(data);
      } catch {
        setItem(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const cycleStatus = async () => {
    const order = ["available", "reserved", "sold"];
    const next = order[(order.indexOf(item.status) + 1) % order.length];
    setUpdating(true);
    try {
      const updated = await base44.entities.InventoryItem.update(item.id, { status: next });
      setItem(updated);
      toast.success(`Marked as ${statusConfig[next].label}`);
    } catch {
      toast.error("Could not update status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="aspect-square rounded-3xl bg-muted animate-pulse" />;
  }

  if (!item) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Piece not found.</p>
        <Link to="/inventory" className="text-[hsl(var(--primary))] font-medium mt-2 inline-block">Back to gallery</Link>
      </div>
    );
  }

  const s = statusConfig[item.status] || statusConfig.available;
  const StatusIcon = s.icon;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <ArrowLeft className="w-5 h-5" /> Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative aspect-[4/5] rounded-3xl overflow-hidden bg-muted"
      >
        {item.image_url ? (
          <Image src={item.image_url} alt={item.title} fittingType="fill" className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center pastel-lavender">
            <span className="text-6xl">🎨</span>
          </div>
        )}
      </motion.div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl text-foreground leading-tight">{item.title}</h1>
          {item.category && <p className="text-sm text-muted-foreground mt-1">{item.category}</p>}
        </div>
        <p className="font-heading text-3xl text-[hsl(var(--primary))]">${Number(item.price).toFixed(0)}</p>
      </div>

      <button
        onClick={cycleStatus}
        disabled={updating}
        className={`w-full h-14 rounded-2xl ${s.bg} ${s.text} font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform`}
      >
        <StatusIcon className="w-5 h-5" />
        {s.label} — tap to change
      </button>

      {item.notes && (
        <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
          <p className="text-sm text-foreground leading-relaxed">{item.notes}</p>
        </div>
      )}

      <div className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">History</p>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Added</span>
            <span className="text-foreground">{new Date(item.created_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current status</span>
            <span className={`font-medium ${s.text}`}>{s.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}