import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted ? theme || "system" : "system";

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <h2 className="font-heading text-lg mb-1">Appearance</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose how Art Flow Creative looks on this device.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = active === value;
          return (
            <button
              key={value}
              onClick={() => mounted && setTheme(value)}
              className={`flex flex-col items-center justify-center gap-2 h-20 rounded-2xl border transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-foreground border-transparent"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}