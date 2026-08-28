import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, ShoppingBag, Package, Receipt, Percent } from "lucide-react";

const items = [
  { label: "Home", to: "/", icon: Home },
  { label: "Orders", to: "/orders", icon: ShoppingBag },
  { label: "Inventory", to: "/inventory", icon: Package },
  { label: "Expenses", to: "/expenses", icon: Receipt },
  { label: "Taxes", to: "/taxes", icon: Percent },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div className="bg-white/90 backdrop-blur-xl border border-[hsl(var(--border))] rounded-[1.75rem] shadow-[0_8px_30px_rgba(80,60,120,0.12)] px-2 py-2 flex items-center justify-between">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center justify-center gap-0.5 w-16 py-1.5"
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