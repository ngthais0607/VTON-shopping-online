"use client";
import type { GarmentSize, Size } from "@/lib/demo-upper/types";
import { CONTROL, CONTROL_ACTIVE, CONTROL_IDLE, LABEL, MUTED } from "./ui";

type SizeSwitcherProps = { options: { size: Size; dimensions?: GarmentSize; estimated: boolean }[]; size: Size | null; onChange: (size: Size) => void };

export function SizeSwitcher({ options, size, onChange }: SizeSwitcherProps) {
  const selected = options.find(option => option.size === size);
  const g = selected?.dimensions;
  return (
    <div>
      <p id="demo-upper-size" className={`mb-3 ${LABEL}`}>Garment size</p>
      <div className={"grid gap-2.5 " + (options.length > 3 ? "grid-cols-4" : "grid-cols-3")} role="radiogroup" aria-labelledby="demo-upper-size">
        {options.map(({ size: s }) => {
          const active = s === size;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s)}
              className={`${CONTROL} font-medium ${active ? CONTROL_ACTIVE : CONTROL_IDLE}`}
            >
              {s}
            </button>
          );
        })}
      </div>
      {options.length === 0 && <p className={`text-sm ${MUTED}`}>No sizes are available to preview for this colour.</p>}
      {selected?.estimated && <p className={`mt-3 text-sm ${MUTED}`}>Measurements are estimated from the shared tee chart.</p>}
      {selected && !g && <p className={`mt-3 text-sm ${MUTED}`}>Measurements for size {size} are missing from this product’s size chart.</p>}
      {g && (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 rounded-lg bg-[#F2EFE7] px-4 py-3 text-sm">
          <div><dt className={MUTED}>Chest</dt><dd className="mt-0.5 font-semibold text-[#1F2418]">{g.chestCircCm} cm</dd></div>
          <div><dt className={MUTED}>Shoulders</dt><dd className="mt-0.5 font-semibold text-[#1F2418]">{g.shoulderWidthCm} cm</dd></div>
          <div><dt className={MUTED}>Length</dt><dd className="mt-0.5 font-semibold text-[#1F2418]">{g.lengthCm} cm</dd></div>
        </dl>
      )}
    </div>
  );
}
