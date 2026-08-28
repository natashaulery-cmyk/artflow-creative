import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";

// Top brand row: logo on the left, page title (and optional subtitle) to its
// right, vertically centered. Optional onBack puts a back button before the
// logo; optional right slot is pushed to the far right.
export default function PageHeader({ title, subtitle, onBack, right, className = "" }) {
  return (
    <header className={`flex items-center gap-3 ${className}`}>
      {onBack && (
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-card border border-[hsl(var(--border))] flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}
      <Link to="/" aria-label="Go to home" className="shrink-0 active:scale-95 transition-transform">
        <Logo size={36} />
      </Link>
      <div className="min-w-0">
        <h1 className="font-heading text-[28px] leading-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}