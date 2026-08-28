import React from "react";

export default function Field({ label, children }) {
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}