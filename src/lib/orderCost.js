// Cost calculation logic for Affordable Art Co orders (client-side copy).
// Packaging is charged ONCE per order (not per item).
export function calculateOrderCosts({ quantity, size, unit_price }, inventoryCost) {
  const qty = Number(quantity) || 0;
  const price = Number(unit_price) || 0;
  const saleTotal = +(qty * price).toFixed(2);

  if (!inventoryCost) {
    return {
      sale_total: saleTotal,
      base_item_cost: 0,
      paper_ink_cost: 0,
      packaging_cost: 0,
      total_cost: 0,
      estimated_profit: saleTotal,
    };
  }

  const baseItemCost = +(qty * inventoryCost.base_item_cost).toFixed(2);
  const paperInkCost = +(qty * inventoryCost.paper_ink_cost).toFixed(2);
  const packagingCost = +(inventoryCost.packaging_cost).toFixed(2);
  const totalCost = +(baseItemCost + paperInkCost + packagingCost).toFixed(2);

  return {
    sale_total: saleTotal,
    base_item_cost: baseItemCost,
    paper_ink_cost: paperInkCost,
    packaging_cost: packagingCost,
    total_cost: totalCost,
    estimated_profit: +(saleTotal - totalCost).toFixed(2),
  };
}

export function calculateUnitCost(inv) {
  if (!inv) return 0;
  return +(
    (Number(inv.base_item_cost) || 0) +
    (Number(inv.paper_ink_cost) || 0) +
    (Number(inv.packaging_cost) || 0)
  ).toFixed(2);
}