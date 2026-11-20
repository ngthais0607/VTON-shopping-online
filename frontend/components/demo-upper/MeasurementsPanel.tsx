"use client";
import { MEASUREMENT_FIELDS, MEASUREMENT_RANGES, type FieldResult } from "@/lib/demo-upper/measurementValidation";
import type { MeasurementField } from "@/lib/demo-upper/types";

type MeasurementsPanelProps = {
  raw: Record<MeasurementField, string>;
  fields: Record<MeasurementField, FieldResult>;
  onChange: (field: MeasurementField, value: string) => void;
  onReset: () => void;
  /** Girths re-measured on the mannequin surface (tape under the arms), for comparison with the inputs. */
  measured?: { chestCm: number; waistCm: number };
};

export function MeasurementsPanel({ raw, fields, onChange, onReset, measured }: MeasurementsPanelProps) {
  return (
    <fieldset className="grid grid-cols-2 gap-x-4 gap-y-5">
      <legend className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Your measurements</legend>
      {MEASUREMENT_FIELDS.map((field) => {
        const range = MEASUREMENT_RANGES[field];
        const result = fields[field];
        const hasIssue = result.status !== "ok";
        const id = `demo-upper-${field}`;
        return (
          <div key={field} className="min-w-0">
            <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[#1C1C1C]">{range.label}</label>
            <div className={"flex min-h-11 items-center border bg-white px-3 focus-within:border-[#1C1C1C] " + (hasIssue ? "border-[#b13d36]" : "border-[#E8E3DB]")}>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={raw[field]}
                onChange={(e) => onChange(field, e.target.value)}
                aria-invalid={hasIssue}
                aria-describedby={`${id}-hint`}
                className="w-full min-w-0 bg-transparent text-sm outline-none"
              />
              <span className="pl-2 text-xs text-[#6B6761]">cm</span>
            </div>
            <p id={`${id}-hint`} className={"mt-1 text-[11px] leading-4 " + (hasIssue ? "text-[#b13d36]" : "text-[#6B6761]")}>
              {hasIssue ? result.message : `${range.min}–${range.max} cm`}
            </p>
          </div>
        );
      })}
      <div className="col-span-2 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-4 text-[#6B6761]" aria-live="polite">
          {measured ? `On the mannequin: chest ${measured.chestCm.toFixed(1)} cm · waist ${measured.waistCm.toFixed(1)} cm` : null}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="min-h-11 shrink-0 border border-[#E8E3DB] bg-white px-3 text-xs font-medium text-[#1C1C1C] hover:border-[#1C1C1C]"
        >
          Reset
        </button>
      </div>
    </fieldset>
  );
}
