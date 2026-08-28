import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  ShoppingBag,
  Package,
  Receipt,
  MoreHorizontal,
  Sparkles,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Percent,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

const primary = [
  { label: "Home", to: "/", icon: Home },
  { label: "Orders", to: "/orders", icon: ShoppingBag },
  { label: "Inventory", to: "/inventory", icon: Package },
  { label: "Expenses", to: "/expenses", icon: Receipt },
];

const more = [
  { label: "Gallery", to: "/gallery", icon: ImageIcon },
  { label: "Calendar", to: "/calendar", icon: CalendarIcon },
  { label: "Taxes", to: "/taxes", icon: Percent },
  { label: "Advisor", to: "/assistant", icon: Sparkles },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastTap, setLastTap] = useState({});

  const isActive = (to) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
  const moreActive = more.some((m) => isActive(m.to));

  const handleTab = (to) => {
    const now = Date.now();
    // Double-tap on the active tab resets to that tab's root path.
    if (isActive(to) && lastTap[to] && now - lastTap[to] < 300) {
      navigate(to);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setLastTap((s) => ({ ...s, [to]: 0 }));
      return;
    }
    setLastTap((s) => ({ ...s, [to]: now }));
    navigate(to);
  };

  const go = (to) => {
    setMoreOpen(false);
    navigate(to);
  };

  const tabs = [...primary, { label: "More", to: "__more", icon: MoreHorizontal }];

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="bg-white/90 backdrop-blur-xl border border-[hsl(var(--border))] rounded-[1.75rem] shadow-[0_8px_30px_rgba(80,60,120,0.12)] px-2 py-2 flex items-center justify-between">
            {tabs.map((item) => {
              const isMore = item.to === "__more";
              const active = isMore ? moreActive || moreOpen : isActive(item.to);
              const Icon = item.icon;
              const onClick = isMore ? () => setMoreOpen(true) : () => handleTab(item.to);
              return (
                <button
                  key={item.label}
                  onClick={onClick}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1.5"
                  aria-label={item.label}
                >
                  <Icon
                    className={`w-[22px] h-[22px] transition-colors ${
                      active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                    }`}
                    strokeWidth={active ? 2.6 : 2}
                  />
                  <span
                    className={`text-xs font-medium transition-colors ${
                      active ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="max-w-md mx-auto rounded-t-[2rem]">
          <DrawerHeader className="text-center">
            <DrawerTitle className="font-heading text-xl">More</DrawerTitle>
            <DrawerDescription>Jump to another section</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {more.map((m) => {
              const Icon = m.icon;
              const active = isActive(m.to);
              return (
                <button
                  key={m.to}
                  onClick={() => go(m.to)}
                  className={`flex flex-col items-center justify-center gap-2 h-24 rounded-3xl border transition-colors ${
                    active
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                      : "bg-card text-foreground border-[hsl(var(--border))]"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}