export const PLATFORMS = ["Vinted", "Depop", "Mercari", "Poshmark", "eBay", "Etsy", "Stan Store"];

export const PLATFORM_TONE = {
  Vinted: "pastel-lavender text-[hsl(var(--primary))]",
  Depop: "pastel-mint text-slate-600",
  Mercari: "pastel-peach text-slate-600",
  Poshmark: "pastel-yellow text-amber-700",
  eBay: "pastel-blue text-slate-600",
  Etsy: "bg-rose-100 text-rose-700",
  "Stan Store": "bg-violet-100 text-violet-700",
};

export const PLATFORM_BAR = {
  Vinted: "bg-[hsl(var(--primary))]",
  Depop: "bg-slate-400",
  Mercari: "bg-amber-400",
  Poshmark: "bg-rose-400",
  eBay: "bg-blue-400",
  Etsy: "bg-violet-400",
  "Stan Store": "bg-violet-500",
};

// Older imports may contain a retired connector name. Keep those orders, but
// never expose that retired connector as a marketplace in the current UI.
export function displayPlatform(value) {
  const raw = String(value || "").trim();
  if (/^fluf(?:_|[\s-]|$)/i.test(raw)) return "Marketplace";
  return raw || "Marketplace";
}

export function displayProductName(order) {
  const name = String(order?.product_name || "").trim();
  if (/^fluf sale$/i.test(name)) return `${displayPlatform(order?.platform)} sale`;
  return name || `${displayPlatform(order?.platform)} sale`;
}