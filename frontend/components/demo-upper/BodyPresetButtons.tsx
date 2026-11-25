"use client";
import { BODY_PRESETS, type BodyPreset } from "@/lib/demo-upper/demoPresets";
import { FOCUS, LABEL, MUTED } from "./ui";

type BodyPresetButtonsProps = { activeId: BodyPreset["id"] | null; presets?: BodyPreset[]; onSelect: (preset: BodyPreset) => void };

export function BodyPresetButtons({ activeId, onSelect, presets = BODY_PRESETS }: BodyPresetButtonsProps) {
  return (
    <div>
      <p id="demo-upper-presets" className={`mb-3 ${LABEL}`}>Body presets</p>
      <div className="grid grid-cols-3 gap-2.5" role="group" aria-labelledby="demo-upper-presets">
        {presets.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(preset)}
              className={`min-h-16 rounded-lg border px-3 py-2.5 text-left transition-colors ${FOCUS} ` + (active ? "border-[#384030] bg-[#DFE3D5] text-[#1F2418]" : "border-[#DAD7CA] bg-white hover:border-[#384030]")}
            >
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className={`block text-xs ${MUTED}`}>{preset.body.heightCm} cm tall</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
