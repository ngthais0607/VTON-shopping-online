"use client";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Header } from "@/app/store/components/Header";
import { Footer } from "@/app/store/components/Footer";
import { measureBody } from "@/lib/demo-upper/bodyField";
import { buildBodyModel, type BodyForm } from "@/lib/demo-upper/bodyGeometry";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { BODY_PRESETS, WOMENS_PRESETS, DEFAULT_OPACITY } from "@/lib/demo-upper/demoPresets";
import { computeFitHints } from "@/lib/demo-upper/fitHints";
import { detectFrontSleeve, hasRaisedCollar, isCompactFittedTee, measureFrontCut } from "@/lib/demo-upper/photoRegistration";
import { buildGarmentDisplay, buildGarmentModel, dimensionsFromFrontPhoto, sleeveLengthFromFrontPhoto } from "@/lib/demo-upper/garmentGeometry";
import { MEASUREMENT_FIELDS, validateField, validateMeasurements } from "@/lib/demo-upper/measurementValidation";
import { fitSizeOptions, resolveProductFit, usesStandardTeeChart } from "@/lib/demo-upper/productFit";
import type { MeasurementField, Size, UpperBodyMeasurements, ViewAngle } from "@/lib/demo-upper/types";
import { BodyPresetButtons } from "./BodyPresetButtons";
import { DisplaySettings } from "./DisplaySettings";
import { FitHints } from "./FitHints";
import { MeasurementsPanel } from "./MeasurementsPanel";
import { SizeSwitcher } from "./SizeSwitcher";
import { CARD, CONTROL, CONTROL_ACTIVE, CONTROL_IDLE, FOCUS, HEADING, LABEL } from "./ui";
import { useGarmentPhotos } from "./useGarmentPhotos";
import { ViewerClient } from "./ViewerClient";

const toRaw = (b: UpperBodyMeasurements) => Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, String(b[f])])) as Record<MeasurementField, string>;

type ProductLoad = { slug: string; product: Product | null; failed: boolean };

/** `productSlug` / `colorName` come from the product page's "3D fit check" link; without them the sample tee is shown. */
const NO_VIEWS = {};
const NO_URLS: string[] = [];

export function TryOn3DPage({ productSlug = null, colorName = null, initialSize = null }: { productSlug?: string | null; colorName?: string | null; initialSize?: string | null }) {
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
  const fit = useMemo(() => resolveProductFit(loaded?.product ?? null, colorName), [loaded, colorName]);
  const photosState = useGarmentPhotos(fit.photos?.views ?? NO_VIEWS, fit.photos?.guessed ?? NO_URLS);

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
  const [pickedSize, setSize] = useState<Size>(initialSize ?? "M");
  const [activeAngle, setActiveAngle] = useState<ViewAngle>(0);
  const [mannequinVisible, setMannequinVisible] = useState(true);
  const [teeVisible, setTeeVisible] = useState(true);
  const [teeOpacity, setTeeOpacity] = useState(1);
  const [showPressure, setShowPressure] = useState(false);
  const [mannequinOpacity, setMannequinOpacity] = useState(DEFAULT_OPACITY);

  const validation = useMemo(() => validateMeasurements(raw, lastValid), [raw, lastValid]);
  const values = useDeferredValue(validation.values);
  const frontPhoto = photosState.photos.find(photo => photo.view === "front");
  const photoSleeve = useMemo(() => frontPhoto ? detectFrontSleeve(frontPhoto) : null, [frontPhoto]);
  const photoCut = useMemo(() => frontPhoto && photoSleeve?.style !== "long" ? measureFrontCut(frontPhoto) : null, [frontPhoto, photoSleeve]);
  const compactFitted = !!frontPhoto && isCompactFittedTee(frontPhoto, photoCut);
  const usesSharedChart = fit.chartSource === "sample" || usesStandardTeeChart(fit.sizes, gender);
  const product = loaded?.product;
  const listedCrop = /\b(?:crop(?:ped)?(?:[ -]?top)?|ao lung)\b/i.test(
    [fit.name, product?.fit].join(" ").normalize("NFD").replace(/\p{M}/gu, ""),
  );
  const useCompactPreview = !!product && usesSharedChart && (listedCrop || compactFitted);
  const photoSizedPreview = useCompactPreview || (usesSharedChart && !!photoCut);
  const sizeOptions = useMemo(() => fitSizeOptions(product ?? null, fit.colorName, fit.sizes, usesSharedChart && gender !== "kids"), [product, fit.colorName, fit.sizes, usesSharedChart, gender]);
  const selected = sizeOptions.find(option => option.size.toLowerCase() === pickedSize.toLowerCase())
    ?? sizeOptions[0];
  const garment = selected?.dimensions;
  const size = selected?.size ?? null;

  const bodyModel = useMemo(() => buildBodyModel(values, form), [values, form]);
  const measured = useMemo(() => measureBody(bodyModel), [bodyModel]);
  const [collarChoice, setCollarChoice] = useState<{ slug: string | null; style: "crew" | "polo" | "photo" } | null>(null);
  const collarStyle = collarChoice?.slug === productSlug ? collarChoice?.style : undefined;
  const listedPolo = /\bpolo\b/i.test([fit.name, productSlug, loaded?.product?.category?.name, loaded?.product?.description].join(" "));
  const detectedPolo = !!frontPhoto && hasRaisedCollar(frontPhoto);
  const polo = collarStyle === "polo" || (collarStyle !== "crew" && (listedPolo || detectedPolo));
  const photoNeckline = !!fit.photos && !polo && collarStyle !== "crew";
  const referenceSize = fit.sizes.find(row => row.size === "M") ?? fit.sizes[Math.floor(fit.sizes.length / 2)];
  const cropLength = useCompactPreview && garment && referenceSize
    ? Math.min(garment.lengthCm, -bodyModel.levels.waist + 1.5 + (garment.lengthCm - referenceSize.lengthCm) * 0.65)
    : undefined;
  const garmentDisplay = useMemo(() => {
    if (!garment) return null;
    let visual = usesSharedChart && photoCut ? dimensionsFromFrontPhoto(garment, photoCut) : garment;
    const sleeveLengthCm = sleeveLengthFromFrontPhoto(visual, photoSleeve);
    if (sleeveLengthCm !== visual.sleeveLengthCm) visual = { ...visual, sleeveLengthCm };
    if (cropLength !== undefined && cropLength < garment.lengthCm) {
      const flare = photoCut ? Math.max(0.02, photoCut.hemToChest - photoCut.waistToChest) : 0.04;
      visual = { ...visual, hemCircCm: Math.min(visual.hemCircCm, visual.waistCircCm + visual.chestCircCm * flare) };
    }
    return buildGarmentDisplay(bodyModel, buildGarmentModel(bodyModel, visual, cropLength), polo, photoNeckline, compactFitted, photoCut);
  }, [bodyModel, garment, cropLength, polo, photoNeckline, compactFitted, photoCut, photoSleeve, usesSharedChart]);
  const hints = useMemo(() => {
    const valid = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, validation.fields[f].status === "ok"]));
    return garment ? computeFitHints(validation.values, garment, valid) : null;
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

  type Note = { text: string; error?: boolean; info?: boolean };
  const rawNotes: (Note | false | null | undefined)[] = [
    loaded?.failed && { text: "This product could not be loaded, so a sample tee is shown.", error: true },
    loaded?.product && fit.chartSource === "sample" && { text: "This product has no size chart yet, so sample tee sizes are used." },
    useCompactPreview
      ? { text: "Waist-length preview. Size advice uses the shared size chart.", info: true }
      : photoCut && { text: "The front photo guides the 3D silhouette. Size advice uses the chart.", info: true },
    photosState.status === "loading" && { text: "Preparing product photos…" },
    photosState.status === "error" && { text: "The product photos could not be used, so the tee shows the plain fabric colour." },
    fit.photos?.recolor && photosState.status === "ready" && { text: "This colour uses reference photos in their original colour.", info: true },
    loaded?.product && !fit.photos && { text: "No garment-only photos for this colour, so the tee shows the plain fabric colour." },
  ];
  const productNotes = rawNotes.filter((note): note is Note => !!note);
  const alerts = productNotes.filter(note => !note.info);
  const infoNotes = productNotes.filter(note => note.info);

  return (
    <div className="flex min-h-screen flex-col bg-[#F2EFE7] text-[#1F2418]">
      <Header />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-24 sm:px-8 lg:px-10 lg:pt-28">
        <Link href="/store" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#5E6557] hover:text-[#1F2418]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to store
        </Link>

        {/* Two balanced columns on desktop: preview + fit result on the left, inputs on the right. On mobile the `contents` wrappers
            dissolve and `order` gives the flow preview → size → measurements → fit guide → settings. */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-5">
          <section aria-labelledby="fit-preview-title" className={`order-1 min-w-0 ${CARD}`}>
            <h1 id="fit-preview-title" className={`mb-4 text-4xl ${HEADING}`}>Fit preview</h1>
            {garmentDisplay ? <ViewerClient
              body={bodyModel}
              garment={garmentDisplay}
              activeAngle={activeAngle}
              onSelectAngle={setActiveAngle}
              mannequinVisible={mannequinVisible}
              teeVisible={teeVisible}
              teeOpacity={teeOpacity}
              showPressure={showPressure && !photoSizedPreview}
              mannequinOpacity={mannequinOpacity}
              fabricColor={fit.fabricColor}
              photos={photosState.photos}
            /> : (
              <p className="flex min-h-64 items-center justify-center bg-[#DFE3D5] p-6 text-center text-base text-[#5E6557]">{productLoading ? "Loading product…" : size ? `Size ${size} needs measurements for a 3D preview.` : "No sizes are configured for this colour."}</p>
            )}
            <details className="group mt-5 border-t border-[#E3E0D4] pt-1">
              <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-[#2F3627] [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                How the preview works
                <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-2 pb-2 text-sm leading-6 text-[#5E6557]">
                <p>Enter your upper-body measurements and the mannequin reshapes to match. Pick a size to see the tee, true to its size chart, from four angles.</p>
                {infoNotes.map(note => <p key={note.text}>{note.text}</p>)}
                <p><strong className="font-semibold text-[#1F2418]">A visual fit preview</strong>, not an exact sizing tool. The mannequin and tee are built from a few measurements using assumed proportions; hip size is estimated and the mannequin ends at the upper hip. Girths measured on the mannequin are close to, but not exactly, your inputs.</p>
                <p>The tee always keeps the true dimensions of the selected size. When a size is smaller than your measurements, it is not stretched to fit; tight areas are listed in the fit guide and can be highlighted in the preview.</p>
                {photosState.photos.length > 0 && <p>The preview uses the product photos and a fitted garment shape. Details near seams and sleeve openings are approximate.</p>}
              </div>
            </details>
          </section>

          {hints && size && garmentDisplay && (
            <div className="order-4 min-w-0">
              <FitHints
                hints={hints}
                size={size}
                tightZones={photoSizedPreview ? [] : garmentDisplay.tightZones}
                pressureAvailable={!photoSizedPreview}
                showPressure={showPressure}
                pressureDisabled={!teeVisible}
                onShowPressureChange={setShowPressure}
              />
            </div>
          )}
          </div>

          <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-5">
            <section aria-label="Product and size" className={`order-2 min-w-0 ${CARD}`}>
              <div className="rounded-2xl bg-[#DFE3D5] p-4 sm:p-5">
                <p className={`text-3xl sm:text-4xl ${HEADING}`}>{productLoading ? "Loading product…" : fit.name}</p>
                {fit.colorName && (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/70 py-1 pl-1.5 pr-3 text-sm font-medium text-[#2F3627]">
                    <span className="h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: fit.fabricColor }} aria-hidden="true" />
                    {fit.colorName}
                  </p>
                )}
                {alerts.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm leading-6" role="status">
                    {alerts.map(note => <li key={note.text} className={note.error ? "text-[#A3362F]" : "text-[#4A5242]"}>{note.text}</li>)}
                  </ul>
                )}
              </div>
              {!productLoading && <div className="mt-5"><SizeSwitcher options={sizeOptions} size={size} onChange={setSize} /></div>}
            </section>

            <section aria-labelledby="measurements-title" className={`order-3 min-w-0 ${CARD} space-y-5`}>
              <h2 id="measurements-title" className={`text-3xl ${HEADING}`}>Your measurements</h2>
              {canChooseForm && <fieldset>
                <legend className={`mb-3 ${LABEL}`}>Mannequin form</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {(["female", "male"] as const).map(option => (
                    <button type="button" key={option} aria-pressed={form === option} onClick={() => setForm(option)}
                      className={`${CONTROL} font-medium ${form === option ? CONTROL_ACTIVE : CONTROL_IDLE}`}>
                      {option === "female" ? "Women" : "Men"}
                    </button>
                  ))}
                </div>
              </fieldset>}
              <BodyPresetButtons presets={presets} activeId={activePreset} onSelect={preset => applyBody(preset.body)} />
              <MeasurementsPanel raw={raw} fields={validation.fields} onChange={changeField} onReset={() => applyBody(defaultBody)} measured={measured} />
            </section>

            <div className="order-5 min-w-0">
            <DisplaySettings
              mannequinVisible={mannequinVisible}
              onMannequinVisible={setMannequinVisible}
              teeVisible={teeVisible}
              onTeeVisible={setTeeVisible}
              teeOpacity={teeOpacity}
              onTeeOpacity={setTeeOpacity}
              mannequinOpacity={mannequinOpacity}
              onMannequinOpacity={setMannequinOpacity}
              collar={loaded?.product ? {
                value: photoNeckline ? "photo" : polo ? "polo" : "crew",
                hasPhotos: !!fit.photos,
                onChange: style => setCollarChoice({ slug: productSlug, style }),
              } : undefined}
            />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
