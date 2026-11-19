"use client";
import { useState } from "react";
import { StoreDialog } from "./store-dialog";
interface SizeChartModalProps { isOpen: boolean; onClose: () => void; sizeChart?: Record<string, Record<string, string | number>> | null; categoryName?: string; }
const DEFAULT_SIZE_CHART: Record<string, Record<string, number>> = {
  S: { chest: 92, waist: 76, hip: 94, length: 68 },
  M: { chest: 96, waist: 80, hip: 98, length: 70 },
  L: { chest: 100, waist: 84, hip: 102, length: 72 },
  XL: { chest: 106, waist: 90, hip: 108, length: 74 },
  XXL: { chest: 112, waist: 96, hip: 114, length: 76 },
};
export function SizeChartModal({ isOpen, onClose, sizeChart, categoryName = "Tops / Clothing" }: SizeChartModalProps) {
  const [unit, setUnit] = useState<"cm" | "inch">("cm");
  const chart = sizeChart || DEFAULT_SIZE_CHART;
  const sizes = Object.keys(chart);
  const metrics = Object.keys(sizes.length ? chart[sizes[0]] : {});
  const names: Record<string, string> = { chest: "Chest", waist: "Waist", hip: "Hip", length: "Length" };
  const format = (value: string | number) => { const number = Number(value); return Number.isNaN(number) ? value : unit === "inch" ? (number / 2.54).toFixed(1) : Math.round(number); };
  return <StoreDialog open={isOpen} onClose={onClose} title="Size guide" description={categoryName}>
    <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{sizeChart ? "Product measurements" : "General guide · measurements may vary by product"}</p><div className="inline-flex border border-border" aria-label="Measurement unit">{(["cm", "inch"] as const).map(value => <button key={value} type="button" aria-pressed={unit === value} onClick={() => setUnit(value)} className={unit === value ? "min-h-11 bg-primary px-4 text-xs text-primary-foreground" : "min-h-11 px-4 text-xs hover:bg-secondary"}>{value}</button>)}</div></div>
      <div className="overflow-x-auto border border-border"><table className="w-full text-left text-xs"><thead className="border-b border-border bg-secondary"><tr><th scope="col" className="px-3 py-4 font-medium">Size</th>{metrics.map(metric => <th key={metric} scope="col" className="px-3 py-4 font-medium">{names[metric] || metric}<span className="mt-1 block font-normal text-muted-foreground">({unit})</span></th>)}</tr></thead><tbody className="divide-y divide-border">{sizes.map(size => <tr key={size}><th scope="row" className="bg-secondary/40 px-3 py-4 font-medium">{size}</th>{metrics.map(metric => <td key={metric} className="px-3 py-4">{format(chart[size][metric])}</td>)}</tr>)}</tbody></table></div>
      <p className="border-l-2 border-primary pl-4 text-xs leading-6 text-muted-foreground">Measure your body in a relaxed position with the tape level. Compare your measurements with the guide and check fit feedback on the product page.</p>
    </div>
  </StoreDialog>;
}
