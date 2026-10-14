import { describe, expect, it } from "vitest";
import { DEFAULT_PRODUCT_PLACEHOLDER, getProductImageUrl } from "../lib/placeholder-images";

describe("placeholder-images utility", () => {
  it("provides the standard default placeholder path", () => {
    expect(DEFAULT_PRODUCT_PLACEHOLDER).toBe("/placeholder.svg");
  });

  it("returns the first image URL when valid images exist", () => {
    const product = {
      images: [
        { url: "https://example.com/item1.jpg" },
        { url: "https://example.com/item2.jpg" },
      ],
    };
    expect(getProductImageUrl(product)).toBe("https://example.com/item1.jpg");
  });

  it("returns the default placeholder when images array is empty or undefined", () => {
    expect(getProductImageUrl({ images: [] })).toBe("/placeholder.svg");
    expect(getProductImageUrl({ images: null })).toBe("/placeholder.svg");
    expect(getProductImageUrl(null)).toBe("/placeholder.svg");
    expect(getProductImageUrl(undefined)).toBe("/placeholder.svg");
  });

  it("supports custom fallback parameter", () => {
    expect(getProductImageUrl(null, "/custom-fallback.png")).toBe("/custom-fallback.png");
  });
});
