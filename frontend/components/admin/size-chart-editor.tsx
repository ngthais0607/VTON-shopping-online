"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import type { SizeChart, SizeChartFamily, SizeChartPreset } from "@/lib/types";

interface SizeChartEditorProps {
  categoryId?: number | null;
  gender?: string;
  value?: SizeChart | null;
  onChange: (chart: SizeChart | null) => void;
}

const METRIC_LABELS: Record<string, string> = {
  chest: "Chest",
  bust: "Bust",
  waist: "Waist",
  hem: "Hem",
  hip: "Hip",
  shoulder: "Shoulder",
  length: "Length",
  sleeve: "Sleeve",
  thigh: "Thigh",
  inseam: "Inseam",
  leg_opening: "Leg opening",
};

const isRow = (row: unknown): row is Record<string, string | number> => typeof row === "object" && row !== null && !Array.isArray(row);

/** Same sizes, metrics and numbers (key order and number/string typing do not matter). */
export function sameChart(a?: SizeChart | null, b?: SizeChart | null): boolean {
  if (!a || !b) return !a && !b;
  const sizes = Object.keys(a);
  if (sizes.length !== Object.keys(b).length) return false;
  return sizes.every((size) => {
    const rowA = a[size];
    const rowB = b[size];
    if (!isRow(rowA) || !isRow(rowB)) return rowA === rowB;
    const metrics = Object.keys(rowA);
    return metrics.length === Object.keys(rowB).length && metrics.every((m) => m in rowB && Number(rowA[m]) === Number(rowB[m]));
  });
}

const AUTO = "auto";

const GROUPS: { type: SizeChartFamily["cloth_type"]; label: string }[] = [
  { type: "upper", label: "Tops" },
  { type: "lower", label: "Bottoms" },
  { type: "overall", label: "Dresses" },
];

const GENDER_TABLE_LABELS: Record<SizeChartPreset["gender_table"], string> = {
  male: "Men's table",
  female: "Women's table",
  unisex: "Unisex table (average of men's and women's)",
  any: "One table for all genders",
};

/**
 * Size chart of the admin product form. By default the category (garment type) and gender decide
 * the standard chart; the "Chart type" list lets the admin pick any chart family by hand instead.
 * A chart the admin has edited is never overwritten by a category change, only offered again.
 */
export function SizeChartEditor({ categoryId, gender = "unisex", value, onChange }: SizeChartEditorProps) {
  const [preset, setPreset] = useState<SizeChartPreset | null>(null);
  const [families, setFamilies] = useState<SizeChartFamily[]>([]);
  const [choice, setChoice] = useState(AUTO);
  const latest = useRef({ value, onChange });
  const lastPreset = useRef<SizeChart | null>(null);
  const force = useRef(false);

  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    let cancelled = false;
    apiGet<SizeChartFamily[]>("/products/size-chart-presets")
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setFamilies(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const gen = encodeURIComponent(gender);
    const load = async () => {
      let next: SizeChartPreset | null = null;
      const url =
        choice !== AUTO
          ? `/products/size-chart-preset?preset_key=${encodeURIComponent(choice)}&gender=${gen}`
          : categoryId
            ? `/products/size-chart-preset?category_id=${categoryId}&gender=${gen}`
            : null;
      if (url) {
        try {
          next = await apiGet<SizeChartPreset | null>(url);
        } catch {
          next = null;
        }
      }
      if (cancelled) return;
      const current = latest.current.value;
      const picked = force.current;
      force.current = false;
      // An explicit pick always replaces the chart; otherwise only an empty chart or one that is
      // still the previous standard chart is replaced.
      const replace = picked ? !!next : !current || sameChart(current, lastPreset.current);
      if (replace && !sameChart(current, next?.size_chart)) latest.current.onChange(next?.size_chart ?? null);
      lastPreset.current = next?.size_chart ?? null;
      setPreset(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [categoryId, gender, choice]);

  const pickFamily = (key: string) => {
    force.current = true;
    setChoice(key);
  };

  // Legacy charts may hold rows that are not objects; they are ignored instead of crashing the form.
  const sizes = value ? Object.keys(value).filter((size) => isRow(value[size])) : [];
  const metrics = Array.from(new Set(sizes.flatMap((size) => Object.keys(value![size]))));
  const isStandard = !!preset && sameChart(value, preset.size_chart);

  const setCell = (size: string, metric: string, raw: string) => {
    if (!value) return;
    const cell = raw === "" ? "" : Number(raw);
    if (cell !== "" && !Number.isFinite(cell)) return;
    onChange({ ...value, [size]: { ...(isRow(value[size]) ? value[size] : {}), [metric]: cell } });
  };

  return (
    <div className="grid gap-2 rounded border border-border p-3" data-testid="size-chart-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Size chart (cm)</span>
        <div className="flex gap-2">
          {preset && !isStandard && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(preset.size_chart)}>
              Use standard chart
            </Button>
          )}
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove chart
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor="size-chart-type" className="text-xs font-medium">
          Chart type
        </label>
        <select
          id="size-chart-type"
          value={choice}
          onChange={(e) => pickFamily(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value={AUTO}>Auto — follow the category</option>
          {GROUPS.map((group) => {
            const items = families.filter((family) => family.cloth_type === group.type);
            if (!items.length) return null;
            return (
              <optgroup key={group.type} label={group.label}>
                {items.map((family) => (
                  <option key={family.preset_key} value={family.preset_key}>
                    {family.label} — {family.sharing === "shared" ? "shared" : "own"}: {family.shared_with.join(", ")}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      {preset ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{preset.label}</span>
          {" · "}
          {preset.sharing === "shared" ? `shared by: ${preset.shared_with.join(", ")}` : "own chart for this garment type"}
          {" · "}
          {GENDER_TABLE_LABELS[preset.gender_table]}
          {isStandard ? "" : " · edited"}
          <br />
          {preset.note}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {categoryId
            ? "No standard chart for this category and gender. Leave it empty or remove it if the product has no size chart."
            : "Pick a category and the standard size chart for that garment type is filled in."}
        </p>
      )}
      {value && sizes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-max text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-1 py-1.5 font-medium">Size</th>
                {metrics.map((metric) => (
                  <th key={metric} scope="col" className="px-1 py-1.5 text-center font-medium">
                    {METRIC_LABELS[metric] ?? metric}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-1 py-1 font-medium">{size}</th>
                  {metrics.map((metric) => (
                    <td key={metric} className="px-0.5 py-1">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        aria-label={`${size} ${METRIC_LABELS[metric] ?? metric}`}
                        className="h-8 w-14 min-w-0 px-1.5 text-center text-xs"
                        value={value[size][metric] ?? ""}
                        onChange={(e) => setCell(size, metric, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
