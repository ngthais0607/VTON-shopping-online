/** Helpers for the admin form: the admin types a regular price and a discount %, the API stores both prices. */

export const MAX_DISCOUNT_PERCENT = 99;

/** Whole-percent discount between the selling price and the original price; 0 when not on sale. */
export function percentOff(price: number, compareAt?: number | null): number {
  if (compareAt == null || !Number.isFinite(compareAt) || compareAt <= 0 || compareAt <= price) return 0;
  return Math.max(1, Math.round(((compareAt - price) / compareAt) * 100));
}

/** Clamps whatever was typed to a whole percent between 0 and 99. */
export function cleanPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT, Math.round(value));
}

/** Selling price after the discount. VND has no minor unit, other currencies keep two decimals. */
export function priceAfterDiscount(regular: number, percent: number, currency = "VND"): number {
  const discounted = regular * (100 - cleanPercent(percent)) / 100;
  return currency === "VND" ? Math.round(discounted) : Math.round(discounted * 100) / 100;
}

/** The pair of API fields for a regular price and a discount percent. */
export function pricesFor(regular: number, percent: number, currency = "VND") {
  const pct = cleanPercent(percent);
  if (pct === 0 || !(regular > 0)) return { price: regular, compare_at_price: null };
  return { price: priceAfterDiscount(regular, pct, currency), compare_at_price: regular };
}
