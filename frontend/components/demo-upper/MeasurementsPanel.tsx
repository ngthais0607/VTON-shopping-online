"use client";
import { MEASUREMENT_FIELDS, MEASUREMENT_RANGES, type FieldResult } from "@/lib/demo-upper/measurementValidation";
import type { MeasurementField } from "@/lib/demo-upper/types";
import { FOCUS, LABEL, MUTED } from "./ui";

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
    <fieldset className="grid grid-cols-2 gap-x-3 gap-y-4">
      <legend className={`mb-4 ${LABEL}`}>Body dimensions</legend>
      {MEASUREMENT_FIELDS.map((field) => {
        const range = MEASUREMENT_RANGES[field];
        const result = fields[field];
        const hasIssue = result.status !== "ok";
        const id = `demo-upper-${field}`;
        return (
          <div key={field} className="min-w-0">
            <label htmlFor={id} className={`mb-1.5 block ${LABEL}`}>{range.label}</label>
            <div className={"flex min-h-12 items-center rounded-lg border bg-white px-3.5 transition-colors focus-within:border-[#384030] focus-within:ring-1 focus-within:ring-[#384030] " + (hasIssue ? "border-[#B13D36]" : "border-[#DAD7CA]")}>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={raw[field]}
                onChange={(e) => onChange(field, e.target.value)}
                aria-invalid={hasIssue}
                aria-describedby={`${id}-hint`}
                className="w-full min-w-0 bg-transparent text-base text-[#1F2418] outline-none"
              />
              <span className={`pl-2 text-sm ${MUTED}`}>cm</span>
            </div>
            <p id={`${id}-hint`} className={"mt-1 text-xs " + (hasIssue ? "text-[#B13D36]" : MUTED)}>
              {hasIssue ? result.message : `${range.min}–${range.max} cm`}
            </p>
          </div>
        );
      })}
      <div className="col-span-2 flex items-center justify-between gap-4 border-t border-[#E3E0D4] pt-4">
        <p className={`text-xs leading-5 ${MUTED}`} aria-live="polite">
          {measured ? `On the mannequin: chest ${measured.chestCm.toFixed(1)} cm · waist ${measured.waistCm.toFixed(1)} cm` : null}
        </p>
        <button
          type="button"
          onClick={onReset}
          className={`min-h-11 shrink-0 rounded-lg border border-[#DAD7CA] bg-white px-5 text-sm font-semibold text-[#1F2418] transition-colors hover:border-[#384030] ${FOCUS}`}
        >
          Reset
        </button>
      </div>
    </fieldset>
  );
}
