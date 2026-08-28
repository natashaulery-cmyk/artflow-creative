import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";

const statusStyles = {
  available: { bg: "pastel-mint", text: "text-emerald-700", label: "Available" },
  sold: { bg: "pastel-peach", text: "text-rose-700", label: "Sold" },
  reserved: { bg: "pastel-yellow", text: "text-amber-700", label: "Reserved" },
};

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.InventoryItem.list("-created_date", 100);
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl text-foreground">Gallery</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{items.length} pieces in your collection</p>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-3xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="pastel-lavender rounded-3xl p-10 text-center">
          <p className="text-muted-foreground text-sm">Your gallery is empty. Add artwork to start tracking your inventory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, i) => {
            const s = statusStyles[item.status] || statusStyles.available;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link to={`/inventory/${item.id}`} className="block">
                  <div className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-muted">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.title}
                        fittingType="fill"
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center pastel-lavender">
                        <span className="text-4xl">🎨</span>
                      </div>
                    )}
                    <span
                      className={`absolute top-3 left-3 px-3 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-2 px-1">
                    <p className="font-medium text-sm text-foreground truncate">{item.title}</p>
                    <p className="font-heading text-base text-[hsl(var(--primary))]">${Number(item.price).toFixed(0)}</p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}