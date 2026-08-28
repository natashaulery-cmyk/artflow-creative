import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-28 overflow-x-clip">
        {/* Keyed by pathname so each navigation replays the horizontal screen
            transition (see .screen-slide in index.css). No resting transform,
            so fixed FABs stay viewport-anchored. */}
        <div key={location.pathname} className="screen-slide">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}