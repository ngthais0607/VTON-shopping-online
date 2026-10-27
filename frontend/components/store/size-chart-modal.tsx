"use client";

import React, { useState } from "react";
import { X, Ruler } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SizeChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  sizeChart?: Record<string, Record<string, string | number>> | null;
  categoryName?: string;
}

const DEFAULT_SIZE_CHART: Record<string, Record<string, number>> = {
  S: { chest: 92, waist: 76, hip: 94, length: 68 },
  M: { chest: 96, waist: 80, hip: 98, length: 70 },
  L: { chest: 100, waist: 84, hip: 102, length: 72 },
  XL: { chest: 106, waist: 90, hip: 108, length: 74 },
  XXL: { chest: 112, waist: 96, hip: 114, length: 76 },
};

export function SizeChartModal({
  isOpen,
  onClose,
  sizeChart,
  categoryName = "Áo / Trang phục",
}: SizeChartModalProps) {
  const [unit, setUnit] = useState<"cm" | "inch">("cm");

  if (!isOpen) return null;

  const chartData = sizeChart || DEFAULT_SIZE_CHART;
  const sizes = Object.keys(chartData);
  const firstRow = sizes.length > 0 ? chartData[sizes[0]] : {};
  const metrics = Object.keys(firstRow);

  const formatValue = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    if (unit === "inch") {
      return (num / 2.54).toFixed(1);
    }
    return Math.round(num);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-xs"
          onClick={onClose}
          data-testid="size-chart-backdrop"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          role="dialog"
          aria-labelledby="size-chart-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Ruler className="w-5 h-5 text-sky-600" />
              <h2
                id="size-chart-title"
                className="text-base font-bold text-slate-900"
              >
                Bảng thông số kích cỡ · {categoryName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6">
            {/* Unit Toggle */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-500 font-medium">
                Kích thước tiêu chuẩn TrueLook (ôm vừa vặn)
              </p>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setUnit("cm")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    unit === "cm"
                      ? "bg-white text-sky-600 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  cm
                </button>
                <button
                  type="button"
                  onClick={() => setUnit("inch")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    unit === "inch"
                      ? "bg-white text-sky-600 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  inch
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Size</th>
                    {metrics.map((m) => (
                      <th key={m} className="py-2.5 px-3 capitalize">
                        {m === "chest"
                          ? `Vòng ngực (${unit})`
                          : m === "waist"
                          ? `Vòng eo (${unit})`
                          : m === "hip"
                          ? `Vòng mông (${unit})`
                          : m === "length"
                          ? `Chiều dài (${unit})`
                          : `${m} (${unit})`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {sizes.map((size) => (
                    <tr
                      key={size}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900 bg-slate-50/30">
                        {size}
                      </td>
                      {metrics.map((m) => (
                        <td key={m} className="py-2.5 px-3">
                          {formatValue(chartData[size][m])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Guide footnote */}
            <div className="mt-4 p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-start gap-2">
              <span className="text-sky-600 font-bold text-xs mt-0.5">ℹ️</span>
              <p className="text-[11px] text-sky-900 leading-relaxed">
                <strong className="font-semibold">Mẹo chọn size:</strong> Nếu số
                đo của bạn nằm giữa 2 kích cỡ, vui lòng chọn kích cỡ lớn hơn để
                thoải mái hoặc kích cỡ nhỏ hơn để vừa ôm dáng.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
