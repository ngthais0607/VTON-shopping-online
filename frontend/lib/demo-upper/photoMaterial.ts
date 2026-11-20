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

const UV_VARYINGS = ORDER.map((_, i) => `varying vec2 vGarmentUv${i};`).join("\n") + /* glsl */ `
varying vec2 vGarmentUvLeft45;
varying vec3 vGarmentPosition;
varying vec3 vGarmentNormal;
varying float vCuffBlend;
`;
const VERTEX_HEAD = "attribute vec2 garmentUvLeft45;\nattribute float garmentCuffBlend;\n" + ORDER.map((_, i) => `attribute vec2 garmentUv${i};`).join("\n") + UV_VARYINGS + "\n";

const FRAGMENT_HEAD = UV_VARYINGS + /* glsl */ `
uniform sampler2D uPhoto0;
uniform sampler2D uPhoto1;
uniform sampler2D uPhoto2;
uniform sampler2D uPhoto3;
uniform vec4 uHas;
uniform vec3 uFallback;
uniform vec3 uTight;
uniform vec4 uExposure;

// Each surface point owns its texture blend. Camera movement changes only
// perspective and lighting, so plackets, prints and cuffs stay in place.
vec3 garmentPhotoColor() {
  vec2 position = vGarmentPosition.xz;
  vec2 normal = normalize(vGarmentNormal).xz;
  // Let the contour guide near-horizontal faces and soften abrupt changes
  // in shading normals across cap seams, folds, and rolled hems.
  vec2 radial = position / max(length(position), 0.001);
  vec2 direction = normal * 0.78 + radial * 0.22;
  direction /= max(length(direction), 0.001);
  float x = abs(direction.x);
  float z = direction.y;
  vec4 facing = vec4(z, (x + z) * 0.70710678, x, -z);
  vec4 w = pow(max(facing, vec4(0.0)), vec4(9.0)) * uHas;

  // Give the straight views exclusive use of the central panels. This
  // keeps a detail present in two photos from being painted twice.
  float centreFront = uHas.x * smoothstep(0.58, 0.88, z);
  float centreBack = uHas.w * smoothstep(0.58, 0.88, -z);
  w.yz *= 1.0 - max(centreFront, centreBack);
  // The collar outline should come from the front exposure across the
  // whole yoke, including the near-horizontal parts of the folded leaves.
  float frontYoke = smoothstep(-0.16, -0.045, vGarmentPosition.y)
    * (1.0 - smoothstep(0.12, 0.19, abs(position.x)))
    * smoothstep(0.0, 0.065, position.y) * uHas.x;
  w = mix(w, vec4(1.0, 0.0, 0.0, 0.0), frontYoke);

  vec3 front = texture2D(uPhoto0, vGarmentUv0).rgb * uExposure.x;
  float side = smoothstep(-0.025, 0.025, position.x);
  vec3 oblique = mix(texture2D(uPhoto1, vGarmentUvLeft45).rgb, texture2D(uPhoto1, vGarmentUv1).rgb, side) * uExposure.y;
  vec3 profile = texture2D(uPhoto2, vGarmentUv2).rgb * uExposure.z;
  vec3 back = texture2D(uPhoto3, vGarmentUv3).rgb * uExposure.w;
  // Both straight projections end at the cuff seam. Keep that landmark
  // continuous around the opening when the side view overlaps it.
  float cuff = smoothstep(0.0, 1.0, vCuffBlend) * uHas.x * uHas.w;
  float backShare = 1.0 - smoothstep(-0.22, 0.22, z);
  w = mix(w, vec4(1.0 - backShare, 0.0, 0.0, backShare), cuff);
  // Unsupported directions fade to fabric instead of wrapping a front print
  // onto the back when an image is missing.
  const float fallbackWeight = 0.003;
  return (front * w.x + oblique * w.y + profile * w.z + back * w.w + uFallback * fallbackWeight)
    / (dot(w, vec4(1.0)) + fallbackWeight);
}

`;

/**
 * Tee material that paints the product photos onto the tee. The vertex colours still carry the fit
 * tint: the geometry is built with a white fabric, so (r − g) gives how far each vertex is mixed
 * towards the tight colour and g gives the collar rib's slight shade.
 */
export function createPhotoMaterial(photos: GarmentPhoto[], tightColor: string): MeshStandardMaterial {
  const tight = new Color(tightColor);
  const fallback = new Color(photos.find((p) => p.view === "front")?.meanColor ?? photos[0]?.meanColor ?? "#cccccc");
  const uniforms: Record<string, { value: unknown }> = {
    uHas: { value: new Vector4(0, 0, 0, 0) },
    uExposure: { value: new Vector4(1, 1, 1, 1) },
    uFallback: { value: fallback },
    uTight: { value: tight },
  };
  const has = uniforms.uHas.value as Vector4;
  const exposure = uniforms.uExposure.value as Vector4;
  const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const reference = luma(fallback);
  ORDER.forEach((view, i) => {
    const photo = photos.find((p) => p.view === view);
    uniforms[`uPhoto${i}`] = { value: photo?.texture ?? null };
    has.setComponent(i, photo ? 1 : 0);
    if (photo) {
      // Limit the correction so a light trim or dark print cannot dominate it.
      const ratio = (reference + 0.015) / (luma(new Color(photo.meanColor)) + 0.015);
      exposure.setComponent(i, Math.max(0.8, Math.min(1.25, Math.sqrt(ratio))));
    }
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
      `#include <begin_vertex>
      vGarmentPosition = position;
      vGarmentNormal = normal;
      vGarmentUvLeft45 = garmentUvLeft45;
      vCuffBlend = garmentCuffBlend;
      ${ORDER.map((_, i) => `vGarmentUv${i} = garmentUv${i};`).join("\n")}`,
    );
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    float tightMix = clamp((vColor.r - vColor.g) / ${tightDelta}, 0.0, 1.0);
    float shade = tightMix < 0.999 ? clamp((vColor.g - tightMix * uTight.g) / (1.0 - tightMix), 0.0, 1.0) : 1.0;
    diffuseColor.rgb = mix(garmentPhotoColor() * shade, uTight, tightMix);
  }`,
    );
  };
  material.customProgramCacheKey = () => "truelook-surface-photo-blend";
  return material;
}

