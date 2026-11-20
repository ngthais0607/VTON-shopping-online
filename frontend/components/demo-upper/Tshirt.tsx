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
  photoTint: string | null;
  tightColor: string;
};

function PhotoTee({ geometry, photos, photoTint, tightColor }: { geometry: BufferGeometry; photos: GarmentPhoto[]; photoTint: string | null; tightColor: string }) {
  const material = useMemo(
    () => createPhotoMaterial(photos, tightColor, photoTint),
    [photos, tightColor, photoTint],
  );
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} renderOrder={0} />;
}

/** Opaque tee, coloured per vertex (tight areas blush red), with a small back logo so the 180° view is recognisable. */
export function Tshirt({ geometry, markerPosition, markerTexture, photos, photoTint, tightColor }: TshirtProps) {
  const [x, y, z] = markerPosition.map((v) => v * CM_TO_M);
  return (
    <group>
      {photos.length ? (
        <PhotoTee geometry={geometry} photos={photos} photoTint={photoTint} tightColor={tightColor} />
      ) : (
        <mesh geometry={geometry} renderOrder={0}>
          <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.85} metalness={0} />
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
