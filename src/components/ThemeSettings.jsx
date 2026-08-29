import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = theme || "system";

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
      <h2 className="font-heading text-lg mb-1">Appearance</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Choose how Art Flow Creative looks on this device.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon }) => {
          const selected = mounted && active === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`h-16 rounded-2xl flex flex-col items-center justify-center gap-1 border transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-foreground border-transparent active:scale-[0.98]"
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