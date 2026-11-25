"use client";
import type { FitHint, FitHints as FitHintsData, FitTone } from "@/lib/demo-upper/fitHints";
import type { TightZone } from "@/lib/demo-upper/garmentGeometry";
import type { Size } from "@/lib/demo-upper/types";
import { CARD, FOCUS, HEADING, MUTED } from "./ui";

const toneClass: Record<FitTone, string> = {
  tight: "bg-[#F6DEDA] text-[#A3362F]",
  snug: "bg-[#F1E6CF] text-[#7A6130]",
  regular: "bg-[#DFE3D5] text-[#2F3627]",
  loose: "bg-[#F2EBE0] text-[#6B5A3E]",
  unknown: "bg-[#ECE9DF] text-[#5E6557]",
};

const zoneLabel: Record<TightZone, string> = { shoulder: "shoulders", chest: "chest", waist: "waist", hem: "hip/hem", sleeve: "sleeves" };

function formatDiff(d: number | null) {
  if (d === null) return "—";
  return `${d > 0 ? "+" : ""}${d} cm`;
}

function Row({ name, hint }: { name: string; hint: FitHint }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#E3E0D4] py-3 last:border-b-0">
      <span className="text-base text-[#1F2418]">{name}</span>
      <span className="flex items-center gap-2.5">
        <span className={`text-sm tabular-nums ${MUTED}`}>{formatDiff(hint.diffCm)}</span>
        <span className={"rounded-full px-3 py-1 text-sm font-medium " + toneClass[hint.tone]}>{hint.label}</span>
      </span>
    </div>
  );
}

type FitHintsProps = {
  hints: FitHintsData;
  size: Size;
  tightZones: TightZone[];
  /** Hidden when the preview is photo-sized (no pressure map available). */
  pressureAvailable: boolean;
  showPressure: boolean;
  pressureDisabled: boolean;
  onShowPressureChange: (value: boolean) => void;
};

export function FitHints({ hints, size, tightZones, pressureAvailable, showPressure, pressureDisabled, onShowPressureChange }: FitHintsProps) {
  const hasWarning = hints.warnings.length > 0 || tightZones.length > 0;
  return (
    <section aria-labelledby="fit-hints-title" className={CARD}>
      <h2 id="fit-hints-title" className={`text-3xl ${HEADING}`}>Fit guide · size {size}</h2>
      <p className={`mt-1.5 text-sm leading-6 ${MUTED}`}>The difference is the garment measurement minus your body measurement.</p>
      <div className="mt-3">
        <Row name="Chest" hint={hints.chest} />
        <Row name="Waist" hint={hints.waist} />
        <Row name="Shoulders" hint={hints.shoulder} />
      </div>
      <div role="status" aria-live="polite">
        {hasWarning && (
          <div className="mt-3 rounded-md border border-[#E8B8B3] bg-[#FAF3F2] px-4 py-3 text-sm leading-6 text-[#A3362F]">
            {tightZones.length > 0 && <p>Areas that may feel tight: {tightZones.map((z) => zoneLabel[z]).join(", ")}.</p>}
            {hints.warnings.map((w) => <p key={w} className={tightZones.length > 0 ? "mt-1 text-sm leading-6" : ""}>{w}</p>)}
          </div>
        )}
      </div>
      {pressureAvailable && (
        <label className={`mt-3 flex min-h-11 items-center gap-3 border-t border-[#E3E0D4] pt-3 text-base text-[#1F2418] ${pressureDisabled ? "opacity-50" : "cursor-pointer"}`}>
          <input type="checkbox" checked={showPressure} disabled={pressureDisabled} onChange={(e) => onShowPressureChange(e.target.checked)} className={`h-5 w-5 rounded accent-[#384030] ${FOCUS}`} />
          Highlight tight areas
        </label>
      )}
    </section>
  );
}
