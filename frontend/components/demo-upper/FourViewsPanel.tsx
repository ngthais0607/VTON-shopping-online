"use client";
import type { ReactNode } from "react";
import { View } from "@react-three/drei";
import { VIEW_ANGLES } from "@/lib/demo-upper/cameraAngles";
import type { ViewAngle } from "@/lib/demo-upper/types";

type FourViewsPanelProps = {
  activeAngle: ViewAngle;
  onSelect: (angle: ViewAngle) => void;
  children: (angle: ViewAngle) => ReactNode;
};

/** 4 góc cố định 0/45/90/180, không có OrbitControls. Bấm vào để đưa view chính về góc đó. */
export function FourViewsPanel({ activeAngle, onSelect, children }: FourViewsPanelProps) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Four fixed views">
      {VIEW_ANGLES.map(({ angle, label }) => {
        const active = angle === activeAngle;
        return (
          <button
            key={angle}
            type="button"
            onClick={() => onSelect(angle)}
            aria-pressed={active}
            className={"group relative aspect-[3/4] overflow-hidden border text-left transition-colors " + (active ? "border-[#1C1C1C]" : "border-[#E8E3DB] hover:border-[#b89b6a]")}
          >
            <View className="absolute inset-0">{children(angle)}</View>
            <span className={"absolute inset-x-0 bottom-0 z-10 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] sm:text-[10px] " + (active ? "bg-[#1C1C1C] text-white" : "bg-white/90 text-[#1C1C1C]")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
