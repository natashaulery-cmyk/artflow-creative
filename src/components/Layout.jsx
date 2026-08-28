import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import QuickAddSheet from "@/components/QuickAddSheet";

export default function Layout() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto px-5 pt-6 pb-32">
        <Outlet />
      </main>
      <BottomNav onQuickAdd={() => setQuickAddOpen(true)} />
      <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}