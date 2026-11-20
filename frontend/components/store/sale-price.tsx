import { formatCurrency } from "@/lib/utils";

/** Percentage off, never rounded down to 0 while a real discount exists. */
export function discountPercent(price: number, compareAt?: number | null): number {
  if (!compareAt || !Number.isFinite(compareAt) || compareAt <= price) return 0;
  return Math.max(1, Math.round(((compareAt - price) / compareAt) * 100));
}

interface SalePriceProps {
  price: number;
  compareAt?: number | null;
  currency?: string;
  /** Text shown before the price, e.g. "From ". */
  prefix?: string;
  className?: string;
}

/** Current price, with the original price struck through and a "-X%" badge while on sale. */
export function SalePrice({ price, compareAt, currency = "VND", prefix = "", className = "" }: SalePriceProps) {
  const percent = discountPercent(price, compareAt);
  if (percent === 0) return <span className={className}>{prefix}{formatCurrency(price, currency)}</span>;
  return (
    <span className={"inline-flex flex-wrap items-baseline gap-x-2 " + className}>
      <span>{prefix}{formatCurrency(price, currency)}</span>
      <s className="text-muted-foreground" aria-label={"Original price " + formatCurrency(compareAt as number, currency)}>
        {formatCurrency(compareAt as number, currency)}
      </s>
      <span className="bg-foreground px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background">-{percent}%</span>
    </span>
  );
}
