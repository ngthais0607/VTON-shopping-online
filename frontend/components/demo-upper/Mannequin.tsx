"use client";
import { FrontSide, type BufferGeometry } from "three";

type MannequinProps = { geometry: BufferGeometry; opacity: number; visible: boolean };

/**
 * Matte ivory porcelain, like a boutique display form: warm wrap-around diffuse light (soft shading, no
 * harsh terminator), a cool bounce from below, a faint satin sheen and a gentle darker rim at the
 * silhouette. In see-through mode it gets more transparent where it faces the camera (fresnel).
 * Lights are fixed in view space so every angle gets the same product-shot lighting.
 */
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vView);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - facing, 2.2);
    vec3 key = normalize(vec3(0.5, 0.75, 0.65));
    vec3 fill = normalize(vec3(-0.8, 0.2, 0.5));
    // Wrapped diffuse: the shadow side stays soft instead of going flat grey.
    float wrapKey = clamp((dot(N, key) + 0.55) / 1.55, 0.0, 1.0);
    float wrapFill = clamp((dot(N, fill) + 0.8) / 1.8, 0.0, 1.0);
    vec3 warm = vec3(0.96, 0.93, 0.88);
    vec3 cool = vec3(0.78, 0.82, 0.90);
    vec3 shade = warm * (0.34 + 0.58 * wrapKey) + cool * 0.16 * wrapFill + cool * 0.07 * max(-N.y, 0.0);
    vec3 base = vec3(0.93, 0.90, 0.85) * shade;
    float sheen = pow(max(dot(N, normalize(key + V)), 0.0), 40.0) * 0.14;
    vec3 rim = vec3(0.60, 0.56, 0.51);
    vec3 col = mix(base, rim, smoothstep(0.35, 1.0, fres) * 0.55) + vec3(sheen);
    float alpha = uOpacity >= 0.999 ? 1.0 : clamp(uOpacity * (1.0 + 1.3 * fres) + sheen, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/**
 * Drawn in 2 passes when see-through:
 * 1) depth only (colorWrite = false), so only the nearest surface of the mannequin survives;
 * 2) glass colour with depthWrite = false, so the far side never shows through as a second layer.
 * The tee is opaque and is always drawn before both passes.
 */
export function Mannequin({ geometry, opacity, visible }: MannequinProps) {
  const solid = opacity >= 0.999;
  if (!visible) return null;
  return (
    <group>
      {!solid && (
        <mesh geometry={geometry} renderOrder={1}>
          <meshBasicMaterial colorWrite={false} depthWrite />
        </mesh>
      )}
      <mesh geometry={geometry} renderOrder={2}>
        {/* Remount when switching between solid and glass: transparency/depthWrite need a program rebuild. */}
        <shaderMaterial
          key={solid ? "solid" : "glass"}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={{ uOpacity: { value: opacity } }}
          side={FrontSide}
          transparent={!solid}
          depthWrite={solid}
        />
      </mesh>
    </group>
  );
}
