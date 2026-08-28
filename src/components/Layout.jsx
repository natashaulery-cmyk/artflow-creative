import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import Logo from "@/components/Logo";

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Logo
        size={34}
        className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-5 z-40"
      />
      <main className="max-w-md mx-auto px-5 pt-[calc(4rem+env(safe-area-inset-top))] pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}