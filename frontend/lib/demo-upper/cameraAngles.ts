import type { ViewAngle } from "./types";

export const VIEW_ANGLES: { angle: ViewAngle; label: string }[] = [
  { angle: 0, label: "Front 0°" },
  { angle: 45, label: "Angle 45°" },
  { angle: 90, label: "Side 90°" },
  { angle: 180, label: "Back 180°" },
];

/** Look-at point (m): between the top of the head (~+0.28) and the trunk base (~−0.85). */
export const CAMERA_TARGET: [number, number, number] = [0, -0.33, 0];
export const CAMERA_DISTANCE = 2.1;
export const CAMERA_FOV = 32;

/** 0° looks from the front (+Z), 90° from the right (+X), 180° from the back. */
export function cameraPosition(angle: ViewAngle, distance = CAMERA_DISTANCE): [number, number, number] {
  const rad = (angle * Math.PI) / 180;
  return [CAMERA_TARGET[0] + Math.sin(rad) * distance, CAMERA_TARGET[1] + 0.06, CAMERA_TARGET[2] + Math.cos(rad) * distance];
}
