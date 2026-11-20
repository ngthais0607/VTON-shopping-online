import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildBodyModel, getKeyRing } from "@/lib/demo-upper/bodyGeometry";
import { GARMENT_SIZES, SIZES } from "@/lib/demo-upper/demoCatalog";
import { BODY_PRESETS, DEFAULT_BODY } from "@/lib/demo-upper/demoPresets";
import { polygonPerimeter } from "@/lib/demo-upper/ellipse";
import { Color } from "three";
import { buildGarmentDisplay, buildGarmentGeometry, buildGarmentModel, TIGHT_MAX_MIX } from "@/lib/demo-upper/garmentGeometry";
import { diagnoseGeometry } from "@/lib/demo-upper/geometryDiagnostics";
import { useDisposableGeometry } from "@/lib/demo-upper/useDisposableGeometry";
import { getBodyField } from "@/lib/demo-upper/bodyField";
import { ringPoint } from "@/lib/demo-upper/ringsToGeometry";

describe("garment geometry", () => {
  it("T08: S/M/L keep their nominal girths on every body", () => {
    for (const preset of BODY_PRESETS) {
      const body = buildBodyModel(preset.body);
      for (const size of SIZES) {
        const g = GARMENT_SIZES[size];
        const model = buildGarmentModel(body, g);
        expect(Math.abs(polygonPerimeter(getKeyRing(model, "chest").radii) - g.chestCircCm)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(polygonPerimeter(getKeyRing(model, "waist").radii) - g.waistCircCm)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(polygonPerimeter(getKeyRing(model, "hem").radii) - g.hemCircCm)).toBeLessThanOrEqual(0.5);
        expect(model.hemY).toBe(-g.lengthCm);
      }
    }
  });

  it("S and M stay different even on a large body (no max(body + ease, size))", () => {
    const body = buildBodyModel({ ...DEFAULT_BODY, chestCm: 118, waistCm: 108 });
    const s = buildGarmentModel(body, GARMENT_SIZES.S);
    const m = buildGarmentModel(body, GARMENT_SIZES.M);
    expect(getKeyRing(s, "chest").radii).not.toEqual(getKeyRing(m, "chest").radii);
  });

  it("T09: chest 104 + S marks the chest tight and the tee stays size S", () => {
    const body = buildBodyModel({ ...DEFAULT_BODY, chestCm: 104 });
    const model = buildGarmentModel(body, GARMENT_SIZES.S);
    const display = buildGarmentDisplay(body, model);
    expect(display.tightZones).toContain("chest");
    expect(model.garment).toEqual(GARMENT_SIZES.S);
    expect(Math.abs(polygonPerimeter(getKeyRing(model, "chest").radii) - 96)).toBeLessThanOrEqual(0.5);
  });

  it("medium body + L has no tight chest or waist", () => {
    const body = buildBodyModel(DEFAULT_BODY);
    const display = buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES.L));
    expect(display.tightZones).not.toContain("chest");
    expect(display.tightZones).not.toContain("waist");
  });

  it("T10: changing the size does not change the body", () => {
    const body = buildBodyModel(DEFAULT_BODY);
    const before = JSON.stringify(body);
    for (const size of SIZES) buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES[size]));
    expect(JSON.stringify(body)).toBe(before);
  });

  it("T11: back logo marker sits behind the tee (negative z, facing back)", () => {
    const body = buildBodyModel(DEFAULT_BODY);
    const display = buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES.M));
    const { position, normal } = display.backMarker;
    position.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(position[2]).toBeLessThan(0);
    expect(normal).toEqual([0, 0, -1]);
    expect(position[1]).toBeLessThan(body.levels.shoulder);
    expect(position[1]).toBeGreaterThan(body.levels.chest);
  });

  it("T07 (tee): finite geometry, no degenerate triangles, per-vertex colours", () => {
    for (const preset of BODY_PRESETS) {
      const body = buildBodyModel(preset.body);
      for (const size of SIZES) {
        const geometry = buildGarmentGeometry(buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES[size])));
        const d = diagnoseGeometry(geometry);
        expect(d.nonFiniteValues).toBe(0);
        expect(d.degenerateTriangles).toBe(0);
        expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
        geometry.dispose();
      }
    }
  });

  it("T12: disposes the old geometry when the input changes and on unmount", () => {
    const disposers: ReturnType<typeof vi.fn>[] = [];
    const factory = () => {
      const dispose = vi.fn();
      disposers.push(dispose);
      return { dispose };
    };
    const { rerender, unmount } = renderHook(({ dep }) => useDisposableGeometry(dep, factory), { initialProps: { dep: 1 } });
    expect(disposers).toHaveLength(1);
    rerender({ dep: 2 });
    expect(disposers).toHaveLength(2);
    expect(disposers[0]).toHaveBeenCalledTimes(1);
    expect(disposers[1]).not.toHaveBeenCalled();
    rerender({ dep: 2 });
    expect(disposers).toHaveLength(2);
    unmount();
    expect(disposers[1]).toHaveBeenCalledTimes(1);
  });
});

describe("tee on the mannequin", () => {
  const CAP_RINGS = 5;
  const FOLD_RINGS = 3;

  it.each(BODY_PRESETS.map((p) => [p.id, p.body] as const))(
    "%s preset: no tee panel or sleeve vertex inside the body for S/M/L (no poke-through)",
    (_id, measurements) => {
      const body = buildBodyModel(measurements);
      const field = getBodyField(body);
      for (const size of SIZES) {
        const display = buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES[size]));
        // Outer surfaces only: the inner hem fold and the sleeve cap tucked into the shoulder are hidden by design.
        const panel = display.torsoRings.slice(0, display.torsoRings.length - FOLD_RINGS);
        let worst = Infinity;
        for (const ring of panel) {
          for (let i = 0; i < ring.radii.length; i++) worst = Math.min(worst, field.torsoSurface(...ringPoint(ring, i)));
        }
        expect(worst).toBeGreaterThan(0.05);
        display.sleeves.forEach((sleeve, index) => {
          let w = Infinity;
          for (const ring of sleeve.rings.slice(CAP_RINGS, sleeve.rings.length - FOLD_RINGS)) {
            for (let i = 0; i < ring.radii.length; i++) w = Math.min(w, field.armSurface(index as 0 | 1, ...ringPoint(ring, i)));
          }
          expect(w).toBeGreaterThan(0.2);
        });
      }
    },
    30_000,
  );

  it("a tee that is too small keeps its size-chart dimensions and is reported tight, not upscaled", () => {
    const body = buildBodyModel({ ...DEFAULT_BODY, chestCm: 116, waistCm: 104 });
    const model = buildGarmentModel(body, GARMENT_SIZES.S);
    const display = buildGarmentDisplay(body, model);
    expect(model.garment).toEqual(GARMENT_SIZES.S);
    expect(Math.abs(polygonPerimeter(getKeyRing(model, "chest").radii) - GARMENT_SIZES.S.chestCircCm)).toBeLessThanOrEqual(0.5);
    expect(display.tightZones).toEqual(expect.arrayContaining(["chest", "waist"]));
    expect(display.tightVertexFraction).toBeGreaterThan(0.2);
  });

  it("the tint changes gradually between neighbouring vertices (no hard red/white patches)", () => {
    const body = buildBodyModel({ ...DEFAULT_BODY, chestCm: 108 });
    const display = buildGarmentDisplay(body, buildGarmentModel(body, GARMENT_SIZES.S));
    const geometry = buildGarmentGeometry(display);
    const color = geometry.getAttribute("color");
    const index = geometry.getIndex()!;
    let maxJump = 0;
    for (let t = 0; t < index.count; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = index.getX(t + e), b = index.getX(t + ((e + 1) % 3));
        maxJump = Math.max(maxJump, Math.abs(color.getX(a) - color.getX(b)) + Math.abs(color.getY(a) - color.getY(b)) + Math.abs(color.getZ(a) - color.getZ(b)));
      }
    }
    // Full fabric→warning contrast (summed over RGB) at the strongest mix; a hard patch would jump by most of it in one edge.
    const fabric = new Color("#EEE9E0");
    const red = new Color("#b13d36");
    const full = (Math.abs(fabric.r - red.r) + Math.abs(fabric.g - red.g) + Math.abs(fabric.b - red.b)) * TIGHT_MAX_MIX;
    expect(maxJump).toBeLessThan(full * 0.5);
    geometry.dispose();
  });
});
