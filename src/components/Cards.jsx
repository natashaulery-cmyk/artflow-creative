import React from "react";
import { formatMoney } from "@/lib/format";

const tones = {
  lavender: "pastel-lavender",
  mint: "pastel-mint",
  peach: "pastel-peach",
  yellow: "pastel-yellow",
  blue: "pastel-blue",
};

export function StatCard({ tone, label, value, sub }) {
  return (
    <div
      className={`${tones[tone] || "bg-card"} rounded-3xl p-5 border border-[hsl(var(--border))]`}
    >
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="font-heading text-2xl mt-2 text-foreground leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function MiniCard({ label, value, tone }) {
  return (
    <div
      className={`${tone ? tones[tone] : "bg-card"} rounded-2xl p-4 border border-[hsl(var(--border))]`}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="font-heading text-lg mt-1 text-foreground">{value}</p>
    </div>
  );
}

export function PlatformBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{formatMoney(value)}</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, transition: "width 0.5s ease" }}
        />
      </div>
    </div>
  );
}

export function EmptyRow({ text }) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}