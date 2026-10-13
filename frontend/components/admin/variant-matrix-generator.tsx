"use client";

import React, { useState, useMemo } from "react";
import { Plus, X, Sparkles, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ColorDefinition {
  name: string;
  hex: string;
}

export interface GeneratedVariant {
  size: string;
  color_name: string;
  color_hex: string | null;
  price?: number;
  stock_quantity: number;
  sku?: string;
}

export interface BulkVariantPayload {
  sizes: string[];
  colors: { name: string; hex: string }[];
  variants: GeneratedVariant[];
  default_stock: number;
  default_price?: number;
}

interface VariantMatrixGeneratorProps {
  productId: number;
  productSlug?: string;
  defaultPrice?: number;
  onGenerate: (payload: BulkVariantPayload) => void;
  className?: string;
}

const APPAREL_PRESET = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOES_PRESET = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"];
const FREESIZE_PRESET = ["ONE_SIZE"];

const POPULAR_COLORS: ColorDefinition[] = [
  { name: "Trắng", hex: "#FFFFFF" },
  { name: "Đen", hex: "#000000" },
  { name: "Xám", hex: "#6B7280" },
  { name: "Xanh navy", hex: "#1E3A8A" },
  { name: "Be", hex: "#F5F5DC" },
  { name: "Đỏ", hex: "#DC2626" },
];

export function VariantMatrixGenerator({
  productId,
  productSlug = "product",
  defaultPrice = 0,
  onGenerate,
  className = "",
}: VariantMatrixGeneratorProps) {
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [customSizeInput, setCustomSizeInput] = useState("");

  const [selectedColors, setSelectedColors] = useState<ColorDefinition[]>([]);
  const [colorNameInput, setColorNameInput] = useState("");
  const [colorHexInput, setColorHexInput] = useState("#000000");

  const [defaultStock, setDefaultStock] = useState<number>(10);
  const [priceInput, setPriceInput] = useState<number>(defaultPrice);

  const applyPreset = (preset: string[]) => {
    setSelectedSizes(Array.from(new Set([...selectedSizes, ...preset])));
  };

  const removeSize = (size: string) => {
    setSelectedSizes(selectedSizes.filter((s) => s !== size));
  };

  const addCustomSize = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const s = customSizeInput.trim().toUpperCase();
    if (s && !selectedSizes.includes(s)) {
      setSelectedSizes([...selectedSizes, s]);
      setCustomSizeInput("");
    }
  };

  const addColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = colorNameInput.trim();
    if (name && !selectedColors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setSelectedColors([...selectedColors, { name, hex: colorHexInput }]);
      setColorNameInput("");
    }
  };

  const togglePopularColor = (c: ColorDefinition) => {
    if (selectedColors.some((sc) => sc.name === c.name)) {
      setSelectedColors(selectedColors.filter((sc) => sc.name !== c.name));
    } else {
      setSelectedColors([...selectedColors, c]);
    }
  };

  const removeColor = (name: string) => {
    setSelectedColors(selectedColors.filter((c) => c.name !== name));
  };

  // Generate matrix combinations
  const combinations: GeneratedVariant[] = useMemo(() => {
    const list: GeneratedVariant[] = [];
    for (const size of selectedSizes) {
      if (selectedColors.length === 0) {
        list.push({
          size,
          color_name: "Tiêu chuẩn",
          color_hex: null,
          price: priceInput,
          stock_quantity: defaultStock,
        });
      } else {
        for (const color of selectedColors) {
          list.push({
            size,
            color_name: color.name,
            color_hex: color.hex,
            price: priceInput,
            stock_quantity: defaultStock,
          });
        }
      }
    }
    return list;
  }, [selectedSizes, selectedColors, priceInput, defaultStock]);

  const handleGenerateClick = () => {
    if (selectedSizes.length === 0 && selectedColors.length === 0) return;
    onGenerate({
      sizes: selectedSizes,
      colors: selectedColors,
      variants: combinations,
      default_stock: defaultStock,
      default_price: priceInput > 0 ? priceInput : undefined,
    });
  };

  return (
    <div className={`bg-white rounded-3xl border border-slate-200/80 p-6 space-y-6 ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Sparkles className="w-5 h-5 text-sky-600" />
        <h3 className="font-bold text-slate-900 text-base">
          Tạo biến thể hàng loạt (Variant Matrix)
        </h3>
      </div>

      {/* Size Presets & Selector */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
          1. Chọn kích cỡ (Sizes)
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(APPAREL_PRESET)}
            className="text-xs rounded-xl border-slate-200 hover:bg-sky-50 hover:text-sky-700"
          >
            Quần áo (XS - XXL)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(SHOES_PRESET)}
            className="text-xs rounded-xl border-slate-200 hover:bg-sky-50 hover:text-sky-700"
          >
            Giày dép (36 - 45)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(FREESIZE_PRESET)}
            className="text-xs rounded-xl border-slate-200 hover:bg-sky-50 hover:text-sky-700"
          >
            Freesize (ONE_SIZE)
          </Button>
        </div>

        {/* Selected Sizes Chips */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {selectedSizes.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 border border-sky-200 text-sky-800 rounded-lg text-xs font-bold"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSize(s)}
                className="text-sky-400 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Custom size input */}
        <div className="flex gap-2 max-w-xs pt-1">
          <Input
            placeholder="Thêm size khác (VD: 3XL)..."
            value={customSizeInput}
            onChange={(e) => setCustomSizeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSize())}
            className="text-xs h-9 rounded-xl"
          />
          <Button
            type="button"
            onClick={() => addCustomSize()}
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-xl text-xs"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Colors Manager */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
          2. Chọn màu sắc (Colors)
        </label>
        <div className="flex flex-wrap gap-2">
          {POPULAR_COLORS.map((pc) => {
            const isSelected = selectedColors.some((c) => c.name === pc.name);
            return (
              <button
                key={pc.name}
                type="button"
                onClick={() => togglePopularColor(pc)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                  isSelected
                    ? "bg-sky-50 border-sky-400 text-sky-900 shadow-2xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-black/10 inline-block"
                  style={{ backgroundColor: pc.hex }}
                />
                <span>{pc.name}</span>
                {isSelected && <Check className="w-3 h-3 text-sky-600" />}
              </button>
            );
          })}
        </div>

        {/* Selected colors chips */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {selectedColors.map((c) => (
            <span
              key={c.name}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/10 inline-block"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
              <button
                type="button"
                onClick={() => removeColor(c.name)}
                className="text-slate-400 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Custom color input */}
        <div className="flex gap-2 max-w-md pt-1 items-center">
          <Input
            placeholder="Tên màu tùy chỉnh..."
            value={colorNameInput}
            onChange={(e) => setColorNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addColor())}
            className="text-xs h-9 rounded-xl flex-1"
          />
          <input
            type="color"
            value={colorHexInput}
            onChange={(e) => setColorHexInput(e.target.value)}
            className="w-9 h-9 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
            title="Chọn mã màu HEX"
          />
          <Button
            type="button"
            onClick={() => addColor()}
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-xl text-xs font-semibold"
          >
            Thêm màu
          </Button>
        </div>
      </div>

      {/* Defaults (Stock & Price) */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Tồn kho mặc định mỗi biến thể
          </label>
          <Input
            type="number"
            min={0}
            value={defaultStock}
            onChange={(e) => setDefaultStock(Math.max(0, parseInt(e.target.value) || 0))}
            className="text-xs h-9 rounded-xl"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Giá bán mặc định (để trống để dùng giá sản phẩm)
          </label>
          <Input
            type="number"
            min={0}
            value={priceInput || ""}
            onChange={(e) => setPriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
            placeholder={defaultPrice ? `${defaultPrice}` : "0"}
            className="text-xs h-9 rounded-xl"
          />
        </div>
      </div>

      {/* Summary & Submit */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Sẽ tạo <strong>{combinations.length}</strong> biến thể kết hợp.
        </p>
        <Button
          type="button"
          onClick={handleGenerateClick}
          disabled={combinations.length === 0}
          className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl px-5 h-10 shadow-md shadow-sky-500/20"
        >
          Tạo ma trận biến thể
        </Button>
      </div>
    </div>
  );
}
