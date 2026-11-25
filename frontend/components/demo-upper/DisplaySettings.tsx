"use client";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { OPACITY_RANGE } from "@/lib/demo-upper/demoPresets";
import { FOCUS, MUTED } from "./ui";

type CollarStyle = "crew" | "polo" | "photo";

type DisplaySettingsProps = {
  mannequinVisible: boolean;
  onMannequinVisible: (value: boolean) => void;
  teeVisible: boolean;
  onTeeVisible: (value: boolean) => void;
  teeOpacity: number;
  onTeeOpacity: (value: number) => void;
  mannequinOpacity: number;
  onMannequinOpacity: (value: number) => void;
  /** Only shown for a loaded product. */
  collar?: { value: CollarStyle; hasPhotos: boolean; onChange: (value: CollarStyle) => void };
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-[#1F2418]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={`h-5 w-5 rounded accent-[#384030] ${FOCUS}`} />
      {label}
    </label>
  );
}

function Slider({ id, label, value, disabled, onChange }: { id: string; label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <label htmlFor={id} className="flex items-center justify-between text-base text-[#1F2418]">
        <span>{label}</span>
        <span className={`tabular-nums text-sm ${MUTED}`}>{Math.round(value * 100)}%</span>
      </label>
      <input id={id} type="range" min={OPACITY_RANGE.min} max={OPACITY_RANGE.max} step={0.05} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-2 h-6 w-full accent-[#384030]" />
    </div>
  );
}

export function DisplaySettings(props: DisplaySettingsProps) {
  const { collar } = props;
  return (
    <details className="group rounded-[28px] border border-[#E3E0D4] bg-white">
      <summary className={`flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[28px] px-5 py-3 sm:px-6 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <SlidersHorizontal className="h-5 w-5 text-[#2F3627]" aria-hidden="true" />
        <span className="flex-1 text-lg font-semibold text-[#2F3627]">Display settings</span>
        <ChevronDown className="h-5 w-5 text-[#2F3627] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-[#E3E0D4] px-5 pb-5 pt-4 sm:px-6">
        <div>
          <Toggle label="Show mannequin" checked={props.mannequinVisible} onChange={props.onMannequinVisible} />
          <Toggle label="Show tee" checked={props.teeVisible} onChange={props.onTeeVisible} />
        </div>
        <Slider id="demo-upper-tee-opacity" label="Tee opacity (see how snug it is)" value={props.teeOpacity} disabled={!props.teeVisible} onChange={props.onTeeOpacity} />
        <Slider id="demo-upper-opacity" label="Mannequin opacity" value={props.mannequinOpacity} disabled={!props.mannequinVisible} onChange={props.onMannequinOpacity} />
        {collar && (
          <label className="flex items-center justify-between gap-3 text-base text-[#1F2418]">
            Collar style
            <select className={`min-h-11 rounded-lg border border-[#DAD7CA] bg-white px-3 text-base ${FOCUS}`} value={collar.value}
              onChange={(e) => collar.onChange(e.target.value as CollarStyle)}>
              {collar.hasPhotos && <option value="photo">From product photos</option>}
              <option value="crew">Crew neck</option>
              <option value="polo">Polo</option>
            </select>
          </label>
        )}
      </div>
    </details>
  );
}
