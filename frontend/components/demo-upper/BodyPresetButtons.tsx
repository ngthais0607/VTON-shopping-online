"use client";
import { BODY_PRESETS, type BodyPreset } from "@/lib/demo-upper/demoPresets";

type BodyPresetButtonsProps = { activeId: BodyPreset["id"] | null; presets?: BodyPreset[]; onSelect: (preset: BodyPreset) => void };

export function BodyPresetButtons({ activeId, onSelect, presets = BODY_PRESETS }: BodyPresetButtonsProps) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Body presets</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Choose a body preset">
        {presets.map((preset) => {
          const active = preset.id === activeId;
          const b = preset.body;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(preset)}
              className={"min-h-14 border px-2 py-2 text-left transition-colors " + (active ? "border-[#1C1C1C] bg-[#1C1C1C] text-white" : "border-[#E8E3DB] bg-white hover:border-[#1C1C1C]")}
            >
              <span className="block text-sm font-medium">{preset.label}</span>
              <span className={"block text-[10px] " + (active ? "text-white/70" : "text-[#6B6761]")}>{b.heightCm} · {b.chestCm}/{b.waistCm} · sh {b.shoulderCm}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
