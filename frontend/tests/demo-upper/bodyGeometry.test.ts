import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { buildBodyModel, getKeyRing } from "@/lib/demo-upper/bodyGeometry";
import { buildBodyGeometry, getBodyField, measureBody, measureGirth } from "@/lib/demo-upper/bodyField";
import { polygonPerimeter } from "@/lib/demo-upper/ellipse";
import { diagnoseGeometry } from "@/lib/demo-upper/geometryDiagnostics";
import { BODY_PRESETS, WOMENS_PRESETS, DEFAULT_BODY } from "@/lib/demo-upper/demoPresets";
import type { BodyModel } from "@/lib/demo-upper/bodyGeometry";

/** Edge use counts (closed 2-manifold ⇒ every edge used exactly twice) and faces wound against the field gradient. */
function meshTopology(geometry: BufferGeometry, model: BodyModel) {
  const index = geometry.getIndex()!;
  const pos = geometry.getAttribute("position");
  const f = getBodyField(model).full;
  const nv = pos.count;
  const edges = new Map<number, number>();
  let flipped = 0;
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    for (let e = 0; e < 3; e++) {
      const u = tri[e], v = tri[(e + 1) % 3];
      const key = Math.min(u, v) * nv + Math.max(u, v);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const P = tri.map((i) => [pos.getX(i) * 100, pos.getY(i) * 100, pos.getZ(i) * 100]);
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [0, 1, 2].map((k) => (P[0][k] + P[1][k] + P[2][k]) / 3);
    const h = 0.05;
    const g = [
      f(c[0] + h, c[1], c[2]) - f(c[0] - h, c[1], c[2]),
      f(c[0], c[1] + h, c[2]) - f(c[0], c[1] - h, c[2]),
      f(c[0], c[1], c[2] + h) - f(c[0], c[1], c[2] - h),
    ];
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] <= 0) flipped++;
  }
  let open = 0;
  let nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) open++;
    if (count > 2) nonManifold++;
  }
  return { open, nonManifold, flipped };
}

describe("body model", () => {
  it("chest and waist key rings match the entered girths", () => {
    const model = buildBodyModel({ ...DEFAULT_BODY, chestCm: 96, waistCm: 80 });
    expect(Math.abs(polygonPerimeter(getKeyRing(model, "chest").radii) - 96)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(polygonPerimeter(getKeyRing(model, "waist").radii) - 80)).toBeLessThanOrEqual(0.5);
  });

  it("T02: changing the chest leaves the waist ring unchanged", () => {
    const a = buildBodyModel({ ...DEFAULT_BODY, chestCm: 86 });
    const b = buildBodyModel({ ...DEFAULT_BODY, chestCm: 112 });
    expect(getKeyRing(b, "waist").radii).toEqual(getKeyRing(a, "waist").radii);
    expect(getKeyRing(b, "waist").y).toBe(getKeyRing(a, "waist").y);
  });

  it("T03: changing the waist leaves the chest ring unchanged", () => {
    const a = buildBodyModel({ ...DEFAULT_BODY, waistCm: 64 });
    const b = buildBodyModel({ ...DEFAULT_BODY, waistCm: 104 });
    expect(getKeyRing(b, "chest").radii).toEqual(getKeyRing(a, "chest").radii);
  });

  it("T04: shoulder landmarks are shoulderCm apart and the arms move out with the shoulders", () => {
    let lastRoot = -Infinity;
    for (const shoulderCm of [40, 44, 50]) {
      const model = buildBodyModel({ ...DEFAULT_BODY, shoulderCm });
      const { acromionLeft: l, acromionRight: r } = model.landmarks;
      expect(Math.hypot(r[0] - l[0], r[1] - l[1], r[2] - l[2])).toBeCloseTo(shoulderCm, 6);
      const right = model.arms[1];
      // The rounded arm head ends near the shoulder line; on narrow shoulders it may sit slightly
      // outside so the arm does not sink into the ribcage.
      expect(Math.abs(right.root[0] + right.rootRadius - shoulderCm / 2)).toBeLessThanOrEqual(right.rootRadius * 0.35);
      expect(right.root[0]).toBeGreaterThan(lastRoot);
      expect(model.arms[0].root[0]).toBeCloseTo(-right.root[0], 6);
      lastRoot = right.root[0];
    }
  });

  it("arms never sink into a broad ribcage on narrow shoulders", () => {
    const model = buildBodyModel({ heightCm: 165, chestCm: 120, waistCm: 100, shoulderCm: 36 });
    const ribHalfWidth = getKeyRing(model, "chest").radii[0];
    expect(model.arms[1].root[0]).toBeGreaterThan(ribHalfWidth);
  });

  it("height scales the torso levels proportionally", () => {
    const m = buildBodyModel({ ...DEFAULT_BODY, heightCm: 180 });
    expect(m.levels.chest).toBeCloseTo(-18.9, 6);
    expect(m.levels.waist).toBeCloseTo(-45, 6);
    expect(m.levels.hip).toBeCloseTo(-55.8, 6);
    const small = buildBodyModel({ ...DEFAULT_BODY, heightCm: 150 });
    expect(small.levels.waist / m.levels.waist).toBeCloseTo(150 / 180, 6);
  });
});

describe("mannequin mesh (one closed implicit surface)", () => {
  it.each(BODY_PRESETS.map((p) => [p.id, p.body] as const))(
    "%s preset: closed, manifold, consistently wound outwards, finite",
    (_id, body) => {
      const model = buildBodyModel(body);
      const geometry = buildBodyGeometry(model);
      const d = diagnoseGeometry(geometry);
      expect(d.nonFiniteValues).toBe(0);
      expect(d.degenerateTriangles).toBe(0);
      expect(d.triangleCount).toBeGreaterThan(5000);
      expect(geometry.getAttribute("normal").count).toBe(geometry.getAttribute("position").count);
      expect(meshTopology(geometry, model)).toEqual({ open: 0, nonManifold: 0, flipped: 0 });
      geometry.dispose();
    },
    30_000,
  );

  it("T05 + T07: heights 150→195 and extreme proportions mesh without holes, NaN or flipped faces", () => {
    const bodies = [
      { heightCm: 150, chestCm: 78, waistCm: 62, shoulderCm: 36 },
      { heightCm: 195, chestCm: 120, waistCm: 110, shoulderCm: 50 },
      { heightCm: 172, chestCm: 120, waistCm: 70, shoulderCm: 36 },
      { heightCm: 160, chestCm: 80, waistCm: 108, shoulderCm: 50 },
    ];
    for (const body of bodies) {
      const model = buildBodyModel(body);
      const geometry = buildBodyGeometry(model);
      expect(diagnoseGeometry(geometry).nonFiniteValues).toBe(0);
      expect(meshTopology(geometry, model)).toEqual({ open: 0, nonManifold: 0, flipped: 0 });
      geometry.dispose();
    }
  }, 60_000);

  it("the coarse preview mesh (shown while values change) is also closed and manifold", () => {
    for (const { body } of BODY_PRESETS) {
      const model = buildBodyModel(body);
      const geometry = buildBodyGeometry(model, 1.6);
      expect(diagnoseGeometry(geometry).nonFiniteValues).toBe(0);
      expect(meshTopology(geometry, model)).toEqual({ open: 0, nonManifold: 0, flipped: 0 });
      geometry.dispose();
    }
  }, 60_000);

  it("girths re-measured on the meshed surface stay within 1% of the inputs", () => {
    for (const { body } of BODY_PRESETS) {
      const measured = measureBody(buildBodyModel(body));
      expect(Math.abs(measured.chestCm - body.chestCm) / body.chestCm).toBeLessThan(0.01);
      expect(Math.abs(measured.waistCm - body.waistCm) / body.waistCm).toBeLessThan(0.01);
    }
  });

  it("chest edits leave the measured waist alone, and waist edits leave the measured chest alone", () => {
    const a = buildBodyModel({ ...DEFAULT_BODY, chestCm: 86 });
    const b = buildBodyModel({ ...DEFAULT_BODY, chestCm: 110 });
    expect(Math.abs(measureGirth(a, a.levels.waist) - measureGirth(b, b.levels.waist))).toBeLessThan(0.3);
    const c = buildBodyModel({ ...DEFAULT_BODY, waistCm: 66 });
    const e = buildBodyModel({ ...DEFAULT_BODY, waistCm: 100 });
    expect(Math.abs(measureGirth(c, c.levels.chest) - measureGirth(e, e.levels.chest))).toBeLessThan(0.3);
  });

  it("the mannequin stops at the base: nothing below it and no legs", () => {
    const model = buildBodyModel(DEFAULT_BODY);
    const { full } = getBodyField(model);
    for (const x of [-10, 0, 10]) expect(full(x, model.levels.base - 3, 0)).toBeGreaterThan(0);
    expect(full(0, model.levels.hip, 0)).toBeLessThan(0);
    expect(full(0, model.levels.neckTop + 3, 0)).toBeGreaterThan(0);
  });
});

it.each(WOMENS_PRESETS)("keeps the entered bust and waist on the $label women's form", ({ body }) => {
  const model = buildBodyModel(body, "female");
  const measured = measureBody(model);
  expect(Math.abs(measured.chestCm - body.chestCm)).toBeLessThan(body.chestCm * 0.01);
  expect(Math.abs(measured.waistCm - body.waistCm)).toBeLessThan(body.waistCm * 0.01);
  const mesh = buildBodyGeometry(model);
  expect(meshTopology(mesh, model)).toEqual({ open: 0, nonManifold: 0, flipped: 0 });
  mesh.dispose();
}, 30000);
