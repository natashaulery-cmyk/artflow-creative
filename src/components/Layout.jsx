import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}