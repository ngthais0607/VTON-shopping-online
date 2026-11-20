"use client";
import type { FitHint, FitHints as FitHintsData, FitTone } from "@/lib/demo-upper/fitHints";
import type { TightZone } from "@/lib/demo-upper/garmentGeometry";
import type { Size } from "@/lib/demo-upper/types";

const toneClass: Record<FitTone, string> = {
  tight: "bg-[#b13d36]/10 text-[#b13d36]",
  snug: "bg-[#b89b6a]/15 text-[#7a6440]",
  regular: "bg-[#1C1C1C]/5 text-[#1C1C1C]",
  loose: "bg-[#b89b6a]/15 text-[#7a6440]",
  unknown: "bg-[#E8E3DB] text-[#6B6761]",
};

const zoneLabel: Record<TightZone, string> = { shoulder: "shoulders", chest: "chest", waist: "waist", hem: "hip/hem", sleeve: "sleeves" };

function formatDiff(d: number | null) {
  if (d === null) return "—";
  return `${d > 0 ? "+" : ""}${d} cm`;
}

function Row({ name, hint }: { name: string; hint: FitHint }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#E8E3DB] py-3 last:border-b-0">
      <span className="text-sm text-[#1C1C1C]">{name}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-[#6B6761]">{formatDiff(hint.diffCm)}</span>
        <span className={"px-2 py-1 text-[11px] font-medium " + toneClass[hint.tone]}>{hint.label}</span>
      </span>
    </div>
  );
}

export function FitHints({ hints, size, tightZones }: { hints: FitHintsData; size: Size; tightZones: TightZone[] }) {
  return (
    <section aria-labelledby="fit-hints-title">
      <p id="fit-hints-title" className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Fit guide · size {size}</p>
      <p className="mb-2 text-[11px] text-[#6B6761]">Difference = garment measurement − body measurement.</p>
      <div>
        <Row name="Chest" hint={hints.chest} />
        <Row name="Waist" hint={hints.waist} />
        <Row name="Shoulders" hint={hints.shoulder} />
      </div>
      <div role="status" aria-live="polite">
        {(hints.warnings.length > 0 || tightZones.length > 0) && (
          <div className="mt-3 border border-[#b13d36]/30 bg-[#b13d36]/5 p-3 text-xs leading-5 text-[#b13d36]">
            {hints.warnings.map((w) => <p key={w}>{w}</p>)}
            {tightZones.length > 0 && <p>Red areas on the tee: {tightZones.map((z) => zoneLabel[z]).join(", ")}.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
