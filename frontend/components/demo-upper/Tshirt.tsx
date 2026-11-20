"use client";
import { useEffect, useMemo } from "react";
import { DoubleSide, type BufferGeometry, type Texture } from "three";
import { CM_TO_M } from "@/lib/demo-upper/ringsToGeometry";
import { createPhotoMaterial, type GarmentPhoto } from "@/lib/demo-upper/photoMaterial";
import type { Vec3 } from "@/lib/demo-upper/types";

type TshirtProps = {
  geometry: BufferGeometry;
  markerPosition: Vec3;
  markerTexture: Texture | null;
  /** Product photos painted onto the tee; empty → plain fabric colour from the vertex colours. */
  photos: GarmentPhoto[];
  tightColor: string;
  /** 1 = opaque; lower lets the mannequin show through to judge how snug the tee is. */
  opacity?: number;
};

function PhotoTee({ geometry, photos, tightColor, opacity }: { geometry: BufferGeometry; photos: GarmentPhoto[]; tightColor: string; opacity: number }) {
  const material = useMemo(
    () => createPhotoMaterial(photos, tightColor),
    [photos, tightColor],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh geometry={geometry} renderOrder={0}>
      <primitive object={material} attach="material" transparent={opacity < 0.999} opacity={opacity} />
    </mesh>
  );
}

/** Opaque tee, coloured per vertex (tight areas blush red), with a small back logo so the 180° view is recognisable. */
export function Tshirt({ geometry, markerPosition, markerTexture, photos, tightColor, opacity = 1 }: TshirtProps) {
  const [x, y, z] = markerPosition.map((v) => v * CM_TO_M);
  return (
    <group>
      {photos.length ? (
        <PhotoTee geometry={geometry} photos={photos} tightColor={tightColor} opacity={opacity} />
      ) : (
        <mesh geometry={geometry} renderOrder={0}>
          <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.85} metalness={0} transparent={opacity < 0.999} opacity={opacity} />
        </mesh>
      )}
      {/* The product's own back photo replaces the TrueLook marker. */}
      {photos.length === 0 && (
        <mesh position={[x, y, z]} rotation={[0, Math.PI, 0]} renderOrder={0}>
          <planeGeometry args={[0.08, 0.032]} />
          {markerTexture ? <meshBasicMaterial map={markerTexture} /> : <meshBasicMaterial color="#1C1C1C" />}
        </mesh>
      )}
    </group>
  );
}
