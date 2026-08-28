import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, ImageIcon, BarChart3, Wallet, Plus } from "lucide-react";

const items = [
  { label: "Today", to: "/", icon: Home },
  { label: "Gallery", to: "/inventory", icon: ImageIcon },
  { label: "add", to: "__fab__", icon: Plus },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Finances", to: "/finances", icon: Wallet },
];

export default function BottomNav({ onQuickAdd }) {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div className="bg-white/85 backdrop-blur-xl border border-[hsl(var(--border))] rounded-[1.75rem] shadow-[0_8px_30px_rgba(80,60,120,0.12)] px-3 py-2 flex items-center justify-between">
          {items.map((item) => {
            if (item.to === "__fab__") {
              return (
                <button
                  key="fab"
                  onClick={onQuickAdd}
                  className="flex flex-col items-center justify-center -mt-7"
                  aria-label="Quick add transaction"
                >
                  <span className="w-14 h-14 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary))]/40 active:scale-95 transition-transform">
                    <Plus className="w-6 h-6" strokeWidth={2.5} />
                  </span>
                </button>
              );
            }
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center justify-center gap-0.5 w-14 py-1.5"
              >
                <Icon
                  className={`w-[22px] h-[22px] transition-colors ${
                    active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                  }`}
                  strokeWidth={active ? 2.6 : 2}
                />
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}