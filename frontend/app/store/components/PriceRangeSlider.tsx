"use client";

import React from "react";
import { Slider } from "@/components/ui/slider";
import { DollarSign } from "lucide-react";

interface PriceRangeSliderProps {
  maxPrice: number;
  currentMax: number;
  onChange: (value: number) => void;
}

export function PriceRangeSlider({ maxPrice, currentMax, onChange }: PriceRangeSliderProps) {
  return (
    <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs space-y-3 w-full max-w-xs">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-sky-600" /> Max Price Filter
        </span>
        <span className="text-sky-600 font-bold bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-100">
          ${currentMax.toLocaleString()}
        </span>
      </div>

      <Slider
        defaultValue={[currentMax]}
        value={[currentMax]}
        max={maxPrice > 0 ? maxPrice : 1000}
        min={0}
        step={10}
        onValueChange={(vals) => onChange(vals[0])}
        className="cursor-pointer"
      />

      <div className="flex justify-between text-[10px] text-slate-400 font-medium">
        <span>$0</span>
        <span>${(maxPrice > 0 ? maxPrice : 1000).toLocaleString()}</span>
      </div>
    </div>
  );
}
