export function formatMoney(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMoneyShort(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return "$" + (n / 1000).toFixed(1).replace(".0", "") + "k";
  return "$" + Math.round(n);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.length <= 10 ? dateStr + "T00:00:00" : dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthKey(dateStr) {
  return (dateStr || "").slice(0, 7);
}

export function currentMonthKey() {
  const d = new Date();
  return d.toISOString().slice(0, 7);
}

export function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}