import { Color, DoubleSide, MeshStandardMaterial, Vector4, type Texture } from "three";
import { type BBox, type PhotoView } from "./garmentPhotos";

import type { tracePhotoRows } from "./photoRegistration";

/** A processed garment photo: backdrop already replaced, bbox in pixels of the texture image. */
export type GarmentPhoto = {
  view: PhotoView;
  url: string;
  texture: Texture;
  box: BBox;
  outline: ReturnType<typeof tracePhotoRows>;
  width: number;
  height: number;
  /** Mean garment colour (hex), used where no photo faces the surface. */
  meanColor: string;
};

const ORDER: PhotoView[] = ["front", "angle45", "side", "back"];

const UV_VARYINGS = ORDER.map((_, i) => `varying vec2 vGarmentUv${i};`).join("\n");
const VERTEX_HEAD = "attribute vec2 garmentUvLeft45;\n" + ORDER.map((_, i) => `attribute vec2 garmentUv${i};`).join("\n") + UV_VARYINGS + "\n";

const FRAGMENT_HEAD = UV_VARYINGS + /* glsl */ `
uniform sampler2D uPhoto0;
uniform sampler2D uPhoto1;
uniform sampler2D uPhoto2;
uniform sampler2D uPhoto3;
uniform vec4 uHas;
uniform vec3 uFallback;
uniform vec3 uTight;
uniform vec3 uTintTo;
uniform vec3 uTintFrom;
uniform float uTint;
// Every viewport chooses its own source. At the four photographed angles
// details come from one exposure. Adjacent exposures crossfade on rotation.
vec3 garmentPhotoColor() {
  vec3 eye = normalize(vec3(cameraPosition.x, 0.0, cameraPosition.z));
  float a = acos(clamp(eye.z, -1.0, 1.0));
  vec4 angles = vec4(0.0, 0.785398, 1.570796, 3.141593);
  vec4 delta = abs(angles - a);
  vec4 w = uHas / pow(max(delta, vec4(0.015)), vec4(4.0));
  w /= max(dot(w, vec4(1.0)), 0.00001);
  vec3 c = w.x * texture2D(uPhoto0, vGarmentUv0).rgb +
         w.y * texture2D(uPhoto1, vGarmentUv1).rgb +
         w.z * texture2D(uPhoto2, vGarmentUv2).rgb +
         w.w * texture2D(uPhoto3, vGarmentUv3).rgb;
  float nearest = min(min(delta.x + (1.0-uHas.x)*4.0, delta.y + (1.0-uHas.y)*4.0),
                      min(delta.z + (1.0-uHas.z)*4.0, delta.w + (1.0-uHas.w)*4.0));
  return mix(c, uFallback, smoothstep(0.85, 1.55, nearest));
}

float tintLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Recolours a photo taken of another colour: pixels close to the garment's mean colour take the
// target colour, keeping their relative brightness (folds, knit). Pixels far from it (prints,
// trims, logos) are left alone.
vec3 tintPhoto(vec3 c) {
  if (uTint < 0.5) return c;
  float ratio = tintLuma(c) / max(tintLuma(uTintFrom), 0.04);
  // Damp the shading so a dark source cannot crush a light target (and vice versa).
  ratio = clamp(1.0 + (ratio - 1.0) * 0.7, 0.45, 1.4);
  vec3 recoloured = clamp(uTintTo * ratio, 0.0, 1.0);
  float keep = smoothstep(0.18, 0.42, distance(c, uTintFrom));
  return mix(recoloured, c, keep);
}
`;

/**
 * Tee material that paints the product photos onto the tee. The vertex colours still carry the fit
 * tint: the geometry is built with a white fabric, so (r − g) gives how far each vertex is mixed
 * towards the tight colour and g gives the collar rib's slight shade.
 */
export function createPhotoMaterial(photos: GarmentPhoto[], tightColor: string, tintColor: string | null = null): MeshStandardMaterial {
  const tight = new Color(tightColor);
  const fallback = new Color(photos.find((p) => p.view === "front")?.meanColor ?? photos[0]?.meanColor ?? "#cccccc");
  const uniforms: Record<string, { value: unknown }> = {
    uHas: { value: new Vector4(0, 0, 0, 0) },
    uFallback: { value: fallback },
    uTight: { value: tight },
    uTintTo: { value: new Color(tintColor ?? "#ffffff") },
    uTintFrom: { value: fallback.clone() },
    uTint: { value: tintColor ? 1 : 0 },
  };
  const has = uniforms.uHas.value as Vector4;
  ORDER.forEach((view, i) => {
    const photo = photos.find((p) => p.view === view);
    uniforms[`uPhoto${i}`] = { value: photo?.texture ?? null };
    has.setComponent(i, photo ? 1 : 0);
  });
  // Unused samplers still need a texture bound; reuse any loaded photo.
  ORDER.forEach((_, i) => {
    if (!uniforms[`uPhoto${i}`].value) uniforms[`uPhoto${i}`].value = photos[0]?.texture ?? null;
  });

  const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.85, metalness: 0 });
  const tightDelta = Math.max(tight.r - tight.g, 1e-3).toFixed(6);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n" + ORDER.map((_, i) => `vGarmentUv${i} = ${i === 1 ? "(cameraPosition.x < 0.0 ? garmentUvLeft45 : garmentUv1)" : `garmentUv${i}`};`).join("\n"),
    );
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    float tightMix = clamp((vColor.r - vColor.g) / ${tightDelta}, 0.0, 1.0);
    float shade = tightMix < 0.999 ? clamp((vColor.g - tightMix * uTight.g) / (1.0 - tightMix), 0.0, 1.0) : 1.0;
    diffuseColor.rgb = mix(tintPhoto(garmentPhotoColor()) * shade, uTight, tightMix);
  }`,
    );
  };
  material.customProgramCacheKey = () => "truelook-garment-photos";
  return material;
}

