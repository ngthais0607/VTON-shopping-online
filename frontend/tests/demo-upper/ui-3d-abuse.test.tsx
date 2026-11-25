import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BodyPresetButtons } from "@/components/demo-upper/BodyPresetButtons";
import { DisplaySettings } from "@/components/demo-upper/DisplaySettings";
import { FitHints } from "@/components/demo-upper/FitHints";
import { MeasurementsPanel } from "@/components/demo-upper/MeasurementsPanel";
import { SizeSwitcher } from "@/components/demo-upper/SizeSwitcher";
import { GARMENT_SIZES } from "@/lib/demo-upper/demoCatalog";
import { BODY_PRESETS, DEFAULT_BODY } from "@/lib/demo-upper/demoPresets";
import { computeFitHints } from "@/lib/demo-upper/fitHints";
import { sleeveLengthFromFrontPhoto } from "@/lib/demo-upper/garmentGeometry";
import { MEASUREMENT_FIELDS, validateMeasurements } from "@/lib/demo-upper/measurementValidation";
import { detectFrontSleeve, tracePhotoRows } from "@/lib/demo-upper/photoRegistration";
import type { MeasurementField } from "@/lib/demo-upper/types";

const HOSTILE = ["", "   ", "abc", "-5", "0", "1e309", "NaN", "Infinity", "170,5", "170cm", "9".repeat(400), "<img src=x onerror=alert(1)>", "149.99", "195.01"];

function rawFrom(values: Partial<Record<MeasurementField, string>> = {}) {
  return { heightCm: "170", chestCm: "92", waistCm: "76", shoulderCm: "42", ...values } as Record<MeasurementField, string>;
}

describe("MeasurementsPanel", () => {
  it.each(HOSTILE)("renders hostile input %j without throwing and flags exactly the bad field", (text) => {
    const raw = rawFrom({ chestCm: text });
    const { fields } = validateMeasurements(raw);
    const { container } = render(<MeasurementsPanel raw={raw} fields={fields} onChange={vi.fn()} onReset={vi.fn()} />);
    const chest = screen.getByLabelText("Chest") as HTMLInputElement;
    expect(chest.value).toBe(text);
    const bad = fields.chestCm.status !== "ok";
    expect(chest).toHaveAttribute("aria-invalid", String(bad));
    // The other three stay valid and never inherit the error.
    expect(container.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(bad ? 1 : 0);
    // The hostile text is rendered as text, never as markup.
    expect(container.querySelector("img")).toBeNull();
  });

  it("describes each input with its hint (range or error) for screen readers", () => {
    const raw = rawFrom({ waistCm: "abc" });
    render(<MeasurementsPanel raw={raw} fields={validateMeasurements(raw).fields} onChange={vi.fn()} onReset={vi.fn()} />);
    const waist = screen.getByLabelText("Waist");
    expect(document.getElementById(waist.getAttribute("aria-describedby")!)).toHaveTextContent("Waist must be a number (cm)");
    const height = screen.getByLabelText("Height");
    expect(document.getElementById(height.getAttribute("aria-describedby")!)).toHaveTextContent("150–195 cm");
  });

  it("reports the typed text unchanged and wires Reset", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const raw = rawFrom();
    render(<MeasurementsPanel raw={raw} fields={validateMeasurements(raw).fields} onChange={onChange} onReset={onReset} measured={{ chestCm: 92.66, waistCm: 76 }} />);
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "1e309" } });
    expect(onChange).toHaveBeenCalledWith("heightCm", "1e309");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("On the mannequin: chest 92.7 cm · waist 76.0 cm")).toBeInTheDocument();
  });

  it("shows no mannequin line when nothing was measured", () => {
    const raw = rawFrom();
    render(<MeasurementsPanel raw={raw} fields={validateMeasurements(raw).fields} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByText(/On the mannequin/)).toBeNull();
  });

  it("has one labelled input per measurement field", () => {
    const raw = rawFrom();
    render(<MeasurementsPanel raw={raw} fields={validateMeasurements(raw).fields} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(MEASUREMENT_FIELDS.length);
  });
});

describe("SizeSwitcher", () => {
  const options = (["S", "M", "L"] as const).map((size) => ({ size, dimensions: GARMENT_SIZES[size], estimated: false }));

  it("marks exactly the selected size and reports changes", () => {
    const onChange = vi.fn();
    render(<SizeSwitcher options={options} size="M" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    fireEvent.click(radios[2]);
    expect(onChange).toHaveBeenCalledWith("L");
  });

  it("handles no sizes, a null selection and an unknown selection without crashing", () => {
    const { rerender } = render(<SizeSwitcher options={[]} size={null} onChange={vi.fn()} />);
    expect(screen.getByText(/No sizes are available/)).toBeInTheDocument();
    rerender(<SizeSwitcher options={options} size={null} onChange={vi.fn()} />);
    expect(screen.queryByText("Chest")).toBeNull();
    rerender(<SizeSwitcher options={options} size={"XXL" as never} onChange={vi.fn()} />);
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("tells the shopper when a size has no chart row, and when it is estimated", () => {
    const { rerender } = render(<SizeSwitcher options={[{ size: "S", estimated: false }]} size="S" onChange={vi.fn()} />);
    expect(screen.getByText(/missing from this product/)).toBeInTheDocument();
    rerender(<SizeSwitcher options={[{ size: "S", dimensions: GARMENT_SIZES.S, estimated: true }]} size="S" onChange={vi.fn()} />);
    expect(screen.getByText(/estimated from the shared tee chart/)).toBeInTheDocument();
  });

  it("uses four columns only when there are more than three sizes", () => {
    const four = [...options, { size: "XL" as const, dimensions: GARMENT_SIZES.L, estimated: false }];
    render(<SizeSwitcher options={four} size="M" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup").className).toContain("grid-cols-4");
  });
});

describe("BodyPresetButtons", () => {
  it("shows the height of every preset and at most one active", () => {
    render(<BodyPresetButtons activeId={BODY_PRESETS[1].id} onSelect={vi.fn()} />);
    const buttons = within(screen.getByRole("group", { name: "Body presets" })).getAllByRole("button");
    expect(buttons).toHaveLength(BODY_PRESETS.length);
    expect(buttons.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    BODY_PRESETS.forEach((p) => expect(screen.getByText(`${p.body.heightCm} cm tall`)).toBeInTheDocument());
  });

  it("passes the clicked preset (not a stale one) and tolerates no active preset", () => {
    const onSelect = vi.fn();
    render(<BodyPresetButtons activeId={null} onSelect={onSelect} />);
    expect(screen.getAllByRole("button").every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    fireEvent.click(screen.getAllByRole("button")[2]);
    expect(onSelect).toHaveBeenCalledWith(BODY_PRESETS[2]);
  });
});

describe("FitHints", () => {
  const garment = GARMENT_SIZES.M;
  const noop = vi.fn();
  const props = { size: "M" as const, pressureAvailable: true, showPressure: false, pressureDisabled: false, onShowPressureChange: noop };

  it("never invents a tight warning when nothing is tight", () => {
    const hints = computeFitHints(DEFAULT_BODY, { ...garment, chestCircCm: 130, waistCircCm: 130, shoulderWidthCm: 50 });
    render(<FitHints hints={hints} tightZones={[]} {...props} />);
    expect(screen.queryByText(/may feel tight/)).toBeNull();
  });

  it("lists tight zones with readable names and keeps the chest warning text", () => {
    const hints = computeFitHints({ ...DEFAULT_BODY, chestCm: 120 }, { ...garment, chestCircCm: 100 });
    render(<FitHints hints={hints} tightZones={["shoulder", "hem"]} {...props} />);
    expect(screen.getByText("Areas that may feel tight: shoulders, hip/hem.")).toBeInTheDocument();
    expect(screen.getByText(/20 cm smaller than your chest/)).toBeInTheDocument();
    expect(screen.getByText("Tight for your measurements")).toBeInTheDocument();
  });

  it("shows a dash and 'Not enough data' for fields that are invalid, never NaN", () => {
    const hints = computeFitHints(DEFAULT_BODY, garment, { chestCm: false, waistCm: false, shoulderCm: false });
    const { container } = render(<FitHints hints={hints} tightZones={[]} {...props} />);
    expect(screen.getAllByText("Not enough data")).toHaveLength(3);
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("signs the difference and keeps the heading in sync with the size", () => {
    const hints = computeFitHints(DEFAULT_BODY, { ...garment, chestCircCm: DEFAULT_BODY.chestCm });
    render(<FitHints hints={hints} tightZones={[]} {...props} size="L" />);
    expect(screen.getByRole("heading", { name: "Fit guide · size L" })).toBeInTheDocument();
    expect(screen.getByText("0 cm", { selector: "span" })).toBeInTheDocument();
  });

  it("hides the pressure toggle for photo-sized previews and disables it with no tee", () => {
    const hints = computeFitHints(DEFAULT_BODY, garment);
    const { rerender } = render(<FitHints hints={hints} tightZones={[]} {...props} pressureAvailable={false} />);
    expect(screen.queryByLabelText("Highlight tight areas")).toBeNull();
    rerender(<FitHints hints={hints} tightZones={[]} {...props} pressureDisabled />);
    expect(screen.getByLabelText("Highlight tight areas")).toBeDisabled();
  });

  it("reports a pressure toggle exactly once per click", () => {
    const onChange = vi.fn();
    render(<FitHints hints={computeFitHints(DEFAULT_BODY, garment)} tightZones={[]} {...props} onShowPressureChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Highlight tight areas"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("DisplaySettings", () => {
  const base = { mannequinVisible: true, onMannequinVisible: vi.fn(), teeVisible: true, onTeeVisible: vi.fn(), teeOpacity: 0.9, onTeeOpacity: vi.fn(), mannequinOpacity: 1, onMannequinOpacity: vi.fn() };

  it("starts collapsed", () => {
    const { container } = render(<DisplaySettings {...base} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });

  it("disables each opacity slider when its layer is hidden", () => {
    const { rerender } = render(<DisplaySettings {...base} teeVisible={false} />);
    expect(screen.getByLabelText(/Tee opacity/)).toBeDisabled();
    expect(screen.getByLabelText(/Mannequin opacity/)).not.toBeDisabled();
    rerender(<DisplaySettings {...base} mannequinVisible={false} />);
    expect(screen.getByLabelText(/Mannequin opacity/)).toBeDisabled();
    expect(screen.getByLabelText(/Tee opacity/)).not.toBeDisabled();
  });

  it("shows opacity as a rounded percentage and forwards slider values as numbers", () => {
    const onTee = vi.fn();
    render(<DisplaySettings {...base} teeOpacity={0.35} onTeeOpacity={onTee} />);
    expect(screen.getByText("35%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Tee opacity/), { target: { value: "0.6" } });
    expect(onTee).toHaveBeenCalledWith(0.6);
  });

  it("only offers 'From product photos' when the product has photos", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DisplaySettings {...base} collar={{ value: "crew", hasPhotos: false, onChange }} />);
    expect(screen.queryByRole("option", { name: "From product photos" })).toBeNull();
    rerender(<DisplaySettings {...base} collar={{ value: "photo", hasPhotos: true, onChange }} />);
    expect(screen.getByRole("option", { name: "From product photos" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Collar style"), { target: { value: "polo" } });
    expect(onChange).toHaveBeenCalledWith("polo");
  });

  it("hides the collar control for the sample tee", () => {
    render(<DisplaySettings {...base} />);
    expect(screen.queryByLabelText("Collar style")).toBeNull();
  });
});

describe("front-photo sleeve detection: degenerate input", () => {
  const box = (x1: number, y1: number) => ({ x0: 0, x1, y0: 0, y1 });
  const sleeveOf = (mask: Uint8Array, size: number, b = box(size - 1, size - 1)) => detectFrontSleeve({ box: b, outline: tracePhotoRows(mask, size, b) });

  it("returns null for an empty mask, a full mask and a tiny box", () => {
    expect(sleeveOf(new Uint8Array(101 * 101), 101)).toBeNull();
    expect(sleeveOf(new Uint8Array(101 * 101).fill(1), 101)).toBeNull();
    expect(sleeveOf(new Uint8Array(10 * 10).fill(1), 10)).toBeNull();
  });

  it("returns null for extreme aspect ratios (a wide banner or a tall strip)", () => {
    const wide = new Uint8Array(200 * 40).fill(1);
    expect(detectFrontSleeve({ box: box(199, 39), outline: tracePhotoRows(wide, 200, box(199, 39)) })).toBeNull();
    const tall = new Uint8Array(40 * 200).fill(1);
    expect(detectFrontSleeve({ box: box(39, 199), outline: tracePhotoRows(tall, 40, box(39, 199)) })).toBeNull();
  });

  it("never throws or returns a non-finite drop for random noise masks", () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let run = 0; run < 60; run++) {
      const size = 60 + Math.floor(rand() * 60);
      const density = rand();
      const mask = Uint8Array.from({ length: size * size }, () => (rand() < density ? 1 : 0));
      const result = sleeveOf(mask, size);
      if (result) {
        expect(Number.isFinite(result.dropToBodyLength)).toBe(true);
        expect(["short", "long"]).toContain(result.style);
      }
    }
  });
});

describe("sleeveLengthFromFrontPhoto: boundaries", () => {
  const chart = (sleeveLengthCm: number) => ({ ...GARMENT_SIZES.M, lengthCm: 70, sleeveLengthCm });

  it("keeps the chart value when the photo agrees or says nothing", () => {
    expect(sleeveLengthFromFrontPhoto(chart(20), null)).toBe(20);
    expect(sleeveLengthFromFrontPhoto(chart(20), { style: "short", dropToBodyLength: 0.4 })).toBe(20);
    expect(sleeveLengthFromFrontPhoto(chart(60), { style: "long", dropToBodyLength: 0.9 })).toBe(60);
  });

  it("treats exactly 42 cm as long, matching the geometry builder", () => {
    expect(sleeveLengthFromFrontPhoto(chart(42), { style: "long", dropToBodyLength: 0.9 })).toBe(42);
    expect(sleeveLengthFromFrontPhoto(chart(41.9), { style: "long", dropToBodyLength: 0.9 })).not.toBe(41.9);
  });

  it.each([
    [{ style: "short", dropToBodyLength: 0 }, 20, 8, 34],
    [{ style: "long", dropToBodyLength: 0 }, 10, 48, 75],
    [{ style: "long", dropToBodyLength: 50 }, 10, 48, 75],
    [{ style: "short", dropToBodyLength: 50 }, 60, 8, 34],
  ] as const)("clamps a corrected sleeve %j into a physical range", (sleeve, chartSleeve, min, max) => {
    const out = sleeveLengthFromFrontPhoto(chart(chartSleeve), { ...sleeve });
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(min);
    expect(out).toBeLessThanOrEqual(max);
  });
});
