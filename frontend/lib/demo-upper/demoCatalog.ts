import type { GarmentSize } from "./types";

/** Sample size chart (cm). Length is measured from the HSP to the hem. */
export const GARMENT_SIZES: Record<(typeof SIZES)[number], GarmentSize> = {
  S: { size: "S", chestCircCm: 96, waistCircCm: 94, hemCircCm: 96, shoulderWidthCm: 42, lengthCm: 65, sleeveLengthCm: 20 },
  M: { size: "M", chestCircCm: 102, waistCircCm: 100, hemCircCm: 102, shoulderWidthCm: 44, lengthCm: 68, sleeveLengthCm: 21 },
  L: { size: "L", chestCircCm: 108, waistCircCm: 106, hemCircCm: 108, shoulderWidthCm: 46, lengthCm: 71, sleeveLengthCm: 22 },
};

export const SIZES = ["S", "M", "L"] as const;

export const DEMO_PRODUCT = {
  id: "demo-tshirt-essential",
  name: "Essential Crew-Neck Tee",
  colorName: "Ivory",
  fabricColor: "#EEE9E0",
  tightColor: "#b13d36",
  images: [
    { src: "/demo-upper-tryon/images/tshirt_front.svg", alt: "Front of the tee (illustration)", label: "Front" },
    { src: "/demo-upper-tryon/images/tshirt_back.svg", alt: "Back of the tee with back logo (illustration)", label: "Back" },
    { src: "/demo-upper-tryon/images/tshirt_side.svg", alt: "Side of the tee (illustration)", label: "Side" },
  ],
} as const;
