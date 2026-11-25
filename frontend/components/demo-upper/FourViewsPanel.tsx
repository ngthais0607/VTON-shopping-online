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

/** 4 góc cố định 0/45/90/180. Bấm vào để đưa view chính về góc đó. */
export function FourViewsPanel({ activeAngle, onSelect, children }: FourViewsPanelProps) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-4" role="group" aria-label="Four fixed views">
      {VIEW_ANGLES.map(({ angle, label }) => {
        const active = angle === activeAngle;
        return (
          <button
            key={angle}
            type="button"
            onClick={() => onSelect(angle)}
            aria-pressed={active}
            aria-label={`Show ${label} view`}
            className={"group relative flex flex-col overflow-hidden border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#384030]" + (active ? "border-[#384030]" : "border-[#DAD7CA] hover:border-[#384030]")}
          >
            <span className="relative block aspect-[3/4] w-full bg-[#DFE3D5] sm:aspect-[7/5]">
              <View className="absolute inset-0">{children(angle)}</View>
            </span>
            <span className={"relative z-10 block px-1 py-2 text-center text-[11px] font-semibold sm:py-2.5 sm:text-sm " + (active ? "bg-[#384030] text-white" : "bg-white text-[#1F2418]")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
