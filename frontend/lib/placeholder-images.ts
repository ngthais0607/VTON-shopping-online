export const DEFAULT_PRODUCT_PLACEHOLDER = "/placeholder.svg";

/**
 * Safely resolves a product image URL, falling back to the centralized placeholder
 * if no valid images exist.
 */
export function getProductImageUrl(
  product?: { images?: Array<{ url: string }> | null } | null,
  fallback = DEFAULT_PRODUCT_PLACEHOLDER
): string {
  if (product?.images && product.images.length > 0 && product.images[0]?.url) {
    return product.images[0].url;
  }
  return fallback;
}
