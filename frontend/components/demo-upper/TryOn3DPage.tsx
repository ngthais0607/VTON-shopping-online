"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/app/store/components/Header";
import { Footer } from "@/app/store/components/Footer";
import { measureBody } from "@/lib/demo-upper/bodyField";
import { buildBodyModel, type BodyForm } from "@/lib/demo-upper/bodyGeometry";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { BODY_PRESETS, WOMENS_PRESETS, DEFAULT_OPACITY, OPACITY_RANGE } from "@/lib/demo-upper/demoPresets";
import { computeFitHints } from "@/lib/demo-upper/fitHints";
import { buildGarmentDisplay, buildGarmentModel } from "@/lib/demo-upper/garmentGeometry";
import { MEASUREMENT_FIELDS, validateField, validateMeasurements } from "@/lib/demo-upper/measurementValidation";
import { resolveProductFit } from "@/lib/demo-upper/productFit";
import type { MeasurementField, Size, UpperBodyMeasurements, ViewAngle } from "@/lib/demo-upper/types";
import { BodyPresetButtons } from "./BodyPresetButtons";
import { FitHints } from "./FitHints";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { SizeSwitcher } from "./SizeSwitcher";
import { useGarmentPhotos } from "./useGarmentPhotos";
import { ViewerClient } from "./ViewerClient";

const toRaw = (b: UpperBodyMeasurements) => Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, String(b[f])])) as Record<MeasurementField, string>;

type ProductLoad = { slug: string; product: Product | null; failed: boolean };

/** `productSlug` / `colorName` come from the product page's "3D fit check" link; without them the sample tee is shown. */
const NO_VIEWS = {};
const NO_URLS: string[] = [];

export function TryOn3DPage({ productSlug = null, colorName = null }: { productSlug?: string | null; colorName?: string | null }) {
  const [load, setLoad] = useState<ProductLoad | null>(null);
  useEffect(() => {
    if (!productSlug) return;
    let cancelled = false;
    apiGet<Product>(`/products/by-slug/${encodeURIComponent(productSlug)}`)
      .then((product) => !cancelled && setLoad({ slug: productSlug, product, failed: false }))
      .catch(() => !cancelled && setLoad({ slug: productSlug, product: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [productSlug]);
  const loaded = load && load.slug === productSlug ? load : null;
  const productLoading = !!productSlug && !loaded;
  const [pickedColor, setPickedColor] = useState<string | null>(colorName);
  const fit = useMemo(() => resolveProductFit(loaded?.product ?? null, pickedColor), [loaded, pickedColor]);
  const photosState = useGarmentPhotos(fit.photos?.views ?? NO_VIEWS, fit.photos?.guessed ?? NO_URLS);
  const [usePhotoColour, setUsePhotoColour] = useState(true);
  const photoTint = fit.photos?.recolor && !usePhotoColour ? fit.fabricColor : null;

  const [chosenForm, setForm] = useState<BodyForm | null>(null);
  const gender = loaded?.product?.gender;
  const fixedForm = gender === "female" || gender === "male" ? gender : null;
  const canChooseForm = !productSlug || gender === "unisex";
  const form = fixedForm ?? chosenForm ?? "male";
  const presets = form === "female" ? WOMENS_PRESETS : BODY_PRESETS;
  const defaultBody = presets[1].body;
  const [inputs, setInputs] = useState(() => {
    const initial = (body: UpperBodyMeasurements) => ({ raw: toRaw(body), lastValid: body });
    return { male: initial(BODY_PRESETS[1].body), female: initial(WOMENS_PRESETS[1].body) };
  });
  const { raw, lastValid } = inputs[form];
  const [pickedSize, setSize] = useState<Size>("M");
  const [activeAngle, setActiveAngle] = useState<ViewAngle>(0);
  const [mannequinVisible, setMannequinVisible] = useState(true);
  const [mannequinOpacity, setMannequinOpacity] = useState(DEFAULT_OPACITY);

  const validation = useMemo(() => validateMeasurements(raw, lastValid), [raw, lastValid]);
  const values = useDeferredValue(validation.values);
  // Keep the picked size when the chart has it; otherwise start from the middle of the chart.
  const garment = fit.sizes.find((g) => g.size === pickedSize) ?? fit.sizes[Math.floor((fit.sizes.length - 1) / 2)];
  const size = garment.size;

  const bodyModel = useMemo(() => buildBodyModel(values, form), [values, form]);
  const measured = useMemo(() => measureBody(bodyModel), [bodyModel]);
  const [collarChoice, setCollarChoice] = useState<{ slug: string | null; style: "crew" | "polo" | "photo" } | null>(null);
  const polo = collarChoice && collarChoice.slug === productSlug ? collarChoice.style === "polo"
    : /\bpolo\b/i.test([fit.name, productSlug, loaded?.product?.category?.name, loaded?.product?.description].join(" "));
  const photoNeckline = !!fit.photos && !polo && (!collarChoice || collarChoice.style === "photo");
  const garmentDisplay = useMemo(() => buildGarmentDisplay(bodyModel, buildGarmentModel(bodyModel, garment), polo, photoNeckline), [bodyModel, garment, polo, photoNeckline]);
  const hints = useMemo(() => {
    const valid = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, validation.fields[f].status === "ok"]));
    return computeFitHints(validation.values, garment, valid);
  }, [validation, garment]);

  const activePreset = validation.complete
    ? presets.find((p) => MEASUREMENT_FIELDS.every((f) => p.body[f] === validation.values[f]))?.id ?? null
    : null;

  const changeField = (field: MeasurementField, value: string) => {
    const result = validateField(field, value);
    setInputs(prev => ({ ...prev, [form]: {
      raw: { ...prev[form].raw, [field]: value },
      lastValid: result.status === "ok" ? { ...prev[form].lastValid, [field]: result.value } : prev[form].lastValid,
    } }));
  };
  const applyBody = (body: UpperBodyMeasurements) =>
    setInputs(prev => ({ ...prev, [form]: { raw: toRaw(body), lastValid: body } }));

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-36">
        <div className="border-b border-[#E8E3DB] pb-8 sm:pb-10">
          <Link href="/store" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-[#6B6761] hover:text-[#1C1C1C]">TrueLook <span aria-hidden="true">/</span> 3D Try-On</Link>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:gap-16">
            <h1 className="text-4xl font-medium leading-[1.04] tracking-[-0.045em] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>Try the tee on a 3D mannequin</h1>
            <p className="max-w-xl text-sm leading-7 text-[#6B6761]">Enter your upper-body measurements and the mannequin reshapes to match. Pick a size to see the tee, true to its size chart, from four angles.</p>
          </div>
        </div>

        <div className="grid gap-10 pt-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14 lg:pt-12">
          <aside className="space-y-8 lg:order-none">
            <div className="border border-[#E8E3DB] bg-[#F1ECE4] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Product</p>
              <p className="mt-1 text-lg font-medium" style={{ fontFamily: "var(--font-display)" }}>{productLoading ? "Loading product…" : fit.name}</p>
              {fit.colors.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a colour">
                  {fit.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      role="radio"
                      aria-checked={c.name === fit.colorName}
                      onClick={() => { setPickedColor(c.name); setUsePhotoColour(false); }}
                      className={"flex min-h-9 items-center gap-2 border px-2 text-xs " + (c.name === fit.colorName ? "border-[#1C1C1C] bg-white" : "border-[#E8E3DB] hover:border-[#1C1C1C]")}
                    >
                      <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c.hex ?? "#ccc" }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                fit.colorName && <p className="text-xs text-[#6B6761]">Colour: {fit.colorName}</p>
              )}
              {loaded?.failed && <p className="mt-2 text-xs text-[#b13d36]">This product could not be loaded, so a sample tee is shown.</p>}
              {loaded?.product && fit.chartSource === "sample" && <p className="mt-2 text-xs text-[#6B6761]">This product has no size chart yet, so sample tee sizes are used.</p>}
              {photosState.status === "loading" && <p className="mt-2 text-xs text-[#6B6761]">Preparing product photos…</p>}
              {photosState.status === "error" && <p className="mt-2 text-xs text-[#6B6761]">The product photos could not be used, so the tee shows the plain fabric colour.</p>}
              {fit.photos?.recolor && photosState.status === "ready" && (
                <label className="mt-2 flex items-center gap-2 text-xs text-[#6B6761]">
                  <input type="checkbox" checked={usePhotoColour} onChange={event => setUsePhotoColour(event.target.checked)} />
                  Use original photo colour
                </label>
              )}
              {loaded?.product && !fit.photos && <p className="mt-2 text-xs text-[#6B6761]">No garment-only photos for this colour, so the tee shows the plain fabric colour.</p>}
            </div>
            {canChooseForm && <fieldset>
              <legend className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Mannequin form</legend>
              <div className="flex gap-2">
                {(["female", "male"] as const).map(option => (
                  <button type="button" key={option} aria-pressed={form === option} onClick={() => setForm(option)}
                    className={"min-h-11 flex-1 border text-sm " + (form === option ? "bg-[#1C1C1C] text-white" : "bg-white")}>
                    {option === "female" ? "Women" : "Men"}
                  </button>
                ))}
              </div>
            </fieldset>}
            <BodyPresetButtons presets={presets} activeId={activePreset} onSelect={preset => applyBody(preset.body)} />
            <MeasurementsPanel raw={raw} fields={validation.fields} onChange={changeField} onReset={() => applyBody(defaultBody)} measured={measured} />
            {loaded?.product && (
              <label className="flex items-center justify-between gap-3 text-sm">Collar style
                <select className="border border-[#E8E3DB] bg-white px-3 py-2" value={photoNeckline ? "photo" : polo ? "polo" : "crew"}
                  onChange={(event) => setCollarChoice({ slug: productSlug, style: event.target.value as "crew" | "polo" | "photo" })}>
                  {fit.photos && <option value="photo">From product photos</option>}
                  <option value="crew">Crew neck</option><option value="polo">Polo</option>
                </select>
              </label>
            )}
            <SizeSwitcher sizes={fit.sizes} size={size} onChange={setSize} />
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Mannequin</p>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={mannequinVisible} onChange={(e) => setMannequinVisible(e.target.checked)} className="h-4 w-4 accent-[#1C1C1C]" />
                Show mannequin
              </label>
              <label htmlFor="demo-upper-opacity" className="mt-2 flex items-center justify-between text-xs text-[#6B6761]">
                <span>Opacity</span>
                <span className="tabular-nums">{Math.round(mannequinOpacity * 100) / 100}</span>
              </label>
              <input
                id="demo-upper-opacity"
                type="range"
                min={OPACITY_RANGE.min}
                max={OPACITY_RANGE.max}
                step={0.05}
                value={mannequinOpacity}
                disabled={!mannequinVisible}
                onChange={(e) => setMannequinOpacity(Number(e.target.value))}
                className="mt-2 w-full accent-[#1C1C1C] disabled:opacity-40"
              />
            </div>
            <FitHints hints={hints} size={size} tightZones={garmentDisplay.tightZones} />
          </aside>

          <section aria-label="3D model" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <ViewerClient
              body={bodyModel}
              garment={garmentDisplay}
              activeAngle={activeAngle}
              onSelectAngle={setActiveAngle}
              mannequinVisible={mannequinVisible}
              mannequinOpacity={mannequinOpacity}
              fabricColor={fit.fabricColor}
              photos={photosState.photos}
              photoTint={photoTint}
            />
            <div className="mt-6 border-l-2 border-[#b89b6a] bg-white px-4 py-3 text-xs leading-6 text-[#6B6761]">
              <p><strong className="font-medium text-[#1C1C1C]">A visual fit preview</strong>, not an exact sizing tool. The mannequin and tee are built from a few measurements using assumed proportions; hip size is estimated and the mannequin ends at the upper hip. Girths measured on the mannequin are close to, but not exactly, your inputs.</p>
              <p className="mt-1">The tee always keeps the true dimensions of the selected size. When a size is smaller than your measurements, it is not stretched to fit; tight areas are tinted red and listed in the fit guide instead.</p>
              {photosState.photos.length > 0 && <p className="mt-1">Product photos follow the short-sleeve model. Details near seams and sleeve openings are approximate.</p>}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
