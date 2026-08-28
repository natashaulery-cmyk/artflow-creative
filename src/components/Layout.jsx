import React, { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Inventory from "@/pages/Inventory";
import Expenses from "@/pages/Expenses";

// Primary bottom-tab views are kept mounted and toggled with `display` so the
// user's scroll position, search input, and filters survive tab switches.
// Non-tab pages (Taxes, Reports, Advisor, Account, Calendar, Gallery) render
// through <Outlet /> with the horizontal screen transition.
const tabs = [
  { path: "/", Comp: Dashboard },
  { path: "/orders", Comp: Orders },
  { path: "/inventory", Comp: Inventory },
  { path: "/expenses", Comp: Expenses },
];
const tabPaths = new Set(tabs.map((t) => t.path));

export default function Layout() {
  const { pathname } = useLocation();
  const scrollPositions = useRef({});

  // Record the window scroll for the active tab so it can be restored later.
  useEffect(() => {
    if (!tabPaths.has(pathname)) return;
    const onScroll = () => {
      scrollPositions.current[pathname] = window.scrollY;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Restore the saved scroll when (re)entering a tab.
  useEffect(() => {
    if (!tabPaths.has(pathname)) return;
    const saved = scrollPositions.current[pathname] ?? 0;
    const id = requestAnimationFrame(() => window.scrollTo(0, saved));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-28 overflow-x-clip">
        {tabs.map(({ path, Comp }) => (
          <div key={path} style={{ display: pathname === path ? "block" : "none" }}>
            <Comp />
          </div>
        ))}
        {!tabPaths.has(pathname) && (
          <div key={pathname} className="screen-slide">
            <Outlet />
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}