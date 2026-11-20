"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { registerPhoto } from "@/lib/demo-upper/photoRegistration";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, View } from "@react-three/drei";
import { BufferAttribute, CanvasTexture, Matrix4, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry } from "three";
import { buildBodyGeometry, MESH_STEP_CM } from "@/lib/demo-upper/bodyField";
import type { BodyModel } from "@/lib/demo-upper/bodyGeometry";
import { CAMERA_FOV, CAMERA_TARGET, cameraPosition, VIEW_ANGLES } from "@/lib/demo-upper/cameraAngles";
import { buildGarmentGeometry, type GarmentDisplay } from "@/lib/demo-upper/garmentGeometry";
import type { GarmentPhoto } from "@/lib/demo-upper/photoMaterial";
import type { ViewAngle } from "@/lib/demo-upper/types";
import { useDisposableGeometry } from "@/lib/demo-upper/useDisposableGeometry";
import { Mannequin } from "./Mannequin";
import { Tshirt } from "./Tshirt";
import { FourViewsPanel } from "./FourViewsPanel";

export type UpperBodySceneProps = {
  body: BodyModel;
  garment: GarmentDisplay;
  activeAngle: ViewAngle;
  onSelectAngle: (angle: ViewAngle) => void;
  mannequinVisible: boolean;
  teeVisible: boolean;
  teeOpacity: number;
  showPressure: boolean;
  mannequinOpacity: number;
  /** Fabric colour of the selected product colour (used where no photo covers the tee). */
  fabricColor: string;
  /** Processed product photos to paint onto the tee. */
  photos: GarmentPhoto[];
  /** Colour the photos are recoloured to when they were taken of another colour; null = as photographed. */
};

export const TIGHT_COLOR = "#b13d36";

function useBackMarkerTexture() {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 102;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1C1C1C";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#b89b6a";
    ctx.font = "600 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TrueLook", canvas.width / 2, canvas.height / 2 + 2);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    // The texture needs a DOM canvas, so it is created on the client after mount.
    setTexture(t);
    return () => t.dispose();
  }, []);
  return texture;
}

function SceneContent(props: { bodyGeometry: BufferGeometry; garmentGeometry: BufferGeometry; garment: GarmentDisplay; marker: CanvasTexture | null; visible: boolean; teeVisible: boolean; teeOpacity: number; opacity: number; photos: GarmentPhoto[] }) {
  return (
    <>
      <color attach="background" args={["#EDE8E0"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -3]} intensity={0.7} />
      {props.teeVisible && <Tshirt geometry={props.garmentGeometry} markerPosition={props.garment.backMarker.position} markerTexture={props.marker} photos={props.photos} tightColor={TIGHT_COLOR} opacity={props.teeOpacity} />}
      <Mannequin geometry={props.bodyGeometry} opacity={props.opacity} visible={props.visible} />
    </>
  );
}

/** Fixed camera for a tile: rotation is derived from position + target and passed as a prop, so re-renders never lose it. */
export function FixedCamera({ angle }: { angle: ViewAngle }) {
  const { position, quaternion } = useMemo(() => {
    const pos = cameraPosition(angle);
    const m = new Matrix4().lookAt(new Vector3(...pos), new Vector3(...CAMERA_TARGET), new Vector3(0, 1, 0));
    return { position: pos, quaternion: new Quaternion().setFromRotationMatrix(m) };
  }, [angle]);
  return <PerspectiveCamera makeDefault fov={CAMERA_FOV} position={position} quaternion={quaternion} />;
}

/** Coarser grid used while measurements are still changing. */
const PREVIEW_STEP_CM = 1.2;
/** How long the inputs must stay unchanged before the full-resolution mannequin is built. */
const SETTLE_MS = 250;
type MannequinInput = { body: BodyModel; step: number };
const buildMannequin = (input: MannequinInput) => buildBodyGeometry(input.body, input.step);
type TeeInput = { garment: GarmentDisplay; fabric: string; photos: GarmentPhoto[]; showPressure: boolean };
// With photos the fabric is white: the photo supplies the colour and the vertex colours only carry the fit tint.
const buildTee = ({ garment, fabric, photos, showPressure }: TeeInput) => {
  const geometry = buildGarmentGeometry(garment, fabric, TIGHT_COLOR, showPressure);
  if (photos.length) {
    const views = ["front", "angle45", "side", "back"] as const;
    const uv = new Map(photos.map(photo => [photo.view, registerPhoto(geometry, photo.view, photo)]));
    const oblique = photos.find(photo => photo.view === "angle45");
    geometry.setAttribute("garmentUvLeft45", oblique ? registerPhoto(geometry, "angle45", oblique, true) : uv.get(photos[0].view)!);
    views.forEach((view, i) => geometry.setAttribute(`garmentUv${i}`, uv.get(view) ?? uv.get(photos[0].view)!));
    // The front and back UV maps are registered to the cuff itself.
    const cuffBlend = new Float32Array(geometry.getAttribute("position").count);
    for (const { start, count, segments } of geometry.userData.sleeves) {
      const cuff = start + count - 4 * segments;
      for (let i = Math.max(start, cuff - 3 * segments); i < start + count; i++) {
        const distance = Math.max(0, (cuff - i + (i - start) % segments) / segments);
        cuffBlend[i] = Math.max(0, 1 - distance / 3);
      }
    }
    geometry.setAttribute("garmentCuffBlend", new BufferAttribute(cuffBlend, 1));
  }
  return geometry;
};

export default function UpperBodyScene({ body, garment, activeAngle, onSelectAngle, mannequinVisible, teeVisible, teeOpacity, showPressure, mannequinOpacity, fabricColor, photos }: UpperBodySceneProps) {
  const container = useRef<HTMLDivElement>(null);
  // Built once here and shared by all five views; the previous geometry is disposed on change.
  // While values change quickly, mesh a coarse preview; once they settle, build the fine mesh.
  const [settled, setSettled] = useState(body);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(body), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [body]);
  const mannequinInput = useMemo<MannequinInput>(
    () => ({ body, step: settled === body ? MESH_STEP_CM : PREVIEW_STEP_CM }),
    [body, settled],
  );
  const bodyGeometry = useDisposableGeometry(mannequinInput, buildMannequin);
  const hasPhotos = photos.length > 0;
  const teeInput = useMemo<TeeInput>(() => ({ garment, photos, showPressure, fabric: hasPhotos ? "#ffffff" : fabricColor }), [garment, photos, showPressure, hasPhotos, fabricColor]);
  const garmentGeometry = useDisposableGeometry(teeInput, buildTee);
  const marker = useBackMarkerTexture();
  const content = useMemo(
    () => <SceneContent bodyGeometry={bodyGeometry} garmentGeometry={garmentGeometry} garment={garment} marker={marker} visible={mannequinVisible} teeVisible={teeVisible} teeOpacity={teeOpacity} opacity={mannequinOpacity} photos={photos} />,
    [bodyGeometry, garmentGeometry, garment, marker, mannequinVisible, teeVisible, teeOpacity, showPressure, mannequinOpacity, photos],
  );
  const activeLabel = VIEW_ANGLES.find((v) => v.angle === activeAngle)?.label;

  return (
    <div ref={container} className="relative">
      <div className="relative aspect-[4/5] w-full overflow-hidden border border-[#E8E3DB] sm:aspect-[5/4] lg:aspect-auto lg:h-[560px]">
        <View className="absolute inset-0">
          <PerspectiveCamera key={activeAngle} makeDefault fov={CAMERA_FOV} position={cameraPosition(activeAngle)} />
          <OrbitControls makeDefault target={CAMERA_TARGET} enablePan={false} minDistance={1.1} maxDistance={3.4} />
          {content}
        </View>
        <p className="pointer-events-none absolute left-3 top-3 z-10 bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">Drag to rotate · {activeLabel}</p>
      </div>
      <FourViewsPanel activeAngle={activeAngle} onSelect={onSelectAngle}>
        {(angle) => (
          <>
            <FixedCamera angle={angle} />
            {content}
          </>
        )}
      </FourViewsPanel>
      {/* drei View decides "offscreen" from viewport coordinates, so the shared canvas must cover the viewport. */}
      <Canvas
        eventSource={container as React.RefObject<HTMLElement>}
        className="!pointer-events-none !fixed !inset-0 !z-[1]"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        fallback={<p className="p-4 text-sm text-[#6B6761]">Your browser does not support WebGL, so the 3D model cannot be shown.</p>}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
