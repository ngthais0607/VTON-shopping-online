"use client";
import type { GarmentSize, Size } from "@/lib/demo-upper/types";

type SizeSwitcherProps = { sizes: GarmentSize[]; size: Size; onChange: (size: Size) => void };

export function SizeSwitcher({ sizes, size, onChange }: SizeSwitcherProps) {
  const g = sizes.find((s) => s.size === size) ?? sizes[0];
  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Size</p>
      <div className={"grid gap-2 " + (sizes.length > 3 ? "grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-label="Choose a size">
        {sizes.map(({ size: s }) => {
          const active = s === size;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s)}
              className={"min-h-11 border text-sm font-medium transition-colors " + (active ? "border-[#1C1C1C] bg-[#1C1C1C] text-white" : "border-[#E8E3DB] bg-white hover:border-[#1C1C1C]")}
            >
              {s}
            </button>
          );
        })}
      </div>
      {g && (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-[#6B6761]">
          <div><dt>Chest</dt><dd className="text-[#1C1C1C]">{g.chestCircCm} cm</dd></div>
          <div><dt>Shoulders</dt><dd className="text-[#1C1C1C]">{g.shoulderWidthCm} cm</dd></div>
          <div><dt>Length</dt><dd className="text-[#1C1C1C]">{g.lengthCm} cm</dd></div>
        </dl>
      )}
    </div>
  );
}
