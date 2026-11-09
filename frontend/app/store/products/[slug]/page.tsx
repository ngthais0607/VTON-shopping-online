"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { StoreDialog } from "@/components/store/store-dialog";
import {
  ArrowLeft,
  Heart,
  ZoomIn,
  Minus,
  Plus,
  Ruler,
  Sparkles,
  ShoppingCart,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { getAvailableStock } from "@/lib/inventory";

import { SizeChartModal } from "@/components/store/size-chart-modal";
import { TryOnModal } from "@/components/store/try-on-modal";
import { useVariantSelection } from "@/hooks/use-variant-selection";
import { apiGet, apiPost } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_PRODUCT_PLACEHOLDER, getProductImageUrl } from "@/lib/placeholder-images";
import type { FitFeedbackType, Product, ReviewSummary, Page, VtonEligibility } from "@/lib/types";
import { useCart } from "../../context/CartContext";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [isSizeChartOpen, setIsSizeChartOpen] = useState(false);
  const [isTryOnOpen, setIsTryOnOpen] = useState(false);
  const [tryOn, setTryOn] = useState<VtonEligibility | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "reviews">("details");

  // Review states
  const [reviewsData, setReviewsData] = useState<ReviewSummary | null>(null);
  const [newRating, setNewRating] = useState(5);
  const [newFitFeedback, setNewFitFeedback] = useState<FitFeedbackType>("true_to_size");
  const [newTitle, setNewTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchProduct = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      let data: Product;
      try {
        data = await apiGet<Product>(`/products/by-slug/${slug}`);
      } catch {
        // Fallback to ID lookup if slug is integer
        data = await apiGet<Product>(`/products/${slug}`);
      }
      setProduct(data);
      if (data.review_summary) {
        setReviewsData(data.review_summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load product");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const fetchReviews = useCallback(async (productId: number) => {
    try {
      const data = await apiGet<ReviewSummary>(`/products/${productId}/reviews`);
      setReviewsData(data);
    } catch {
      // Ignore background review failure
    }
  }, []);

  useEffect(() => {
    void fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!product) return;
    void fetchReviews(product.id);
    try { setWishlisted(JSON.parse(localStorage.getItem("truelook-wishlist") || "[]").includes(product.id)); } catch { /* Storage is optional. */ }
    let active = true;
    const query = new URLSearchParams({ limit: "5", is_active: "true" });
    if (product.category?.id) query.set("category_id", String(product.category.id));
    void apiGet<Page<Product>>("/products?" + query.toString()).then(data => {
      if (active) setRelatedProducts((data.items || []).filter(item => item.id !== product.id).slice(0, 4));
    }).catch(() => { /* Recommendations are optional. */ });
    return () => { active = false; };
  }, [product, fetchReviews]);

  const toggleWishlist = () => {
    if (!product) return;
    try {
      const saved: number[] = JSON.parse(localStorage.getItem("truelook-wishlist") || "[]");
      const next = saved.includes(product.id) ? saved.filter(id => id !== product.id) : [...saved, product.id];
      localStorage.setItem("truelook-wishlist", JSON.stringify(next));
      const metadata: { id: number; slug?: string; name: string; price: number; currency: string }[] = JSON.parse(localStorage.getItem("truelook_wishlist") || "[]");
      const remaining = metadata.filter(item => item.id !== product.id);
      if (next.includes(product.id)) remaining.push({ id: product.id, slug: product.slug, name: product.name, price: product.price, currency: product.currency });
      localStorage.setItem("truelook_wishlist", JSON.stringify(remaining)); setWishlisted(next.includes(product.id));
    } catch { setWishlisted(value => !value); }
  };

  const {
    selectedColor,
    selectedSize,
    selectedVariant,
    availableColors,
    availableSizes,
    isOutOfStock,
    price,
    setColor,
    setSize,
  } = useVariantSelection({
    variants: product?.variants ?? [],
    defaultPrice: product?.price ?? 0,
  });

  useEffect(() => {
    setQuantity(current => Math.min(current, Math.max(1, selectedVariant ? getAvailableStock(selectedVariant) : 1)));
  }, [selectedVariant]);

  // Virtual try-on availability depends on category and a raster garment image per colour.
  const productId = product?.id;
  useEffect(() => {
    if (!productId) return;
    let ignore = false;
    const query = selectedColor ? `?color=${encodeURIComponent(selectedColor)}` : "";
    apiGet<VtonEligibility>(`/vton/products/${productId}/eligibility${query}`)
      .then((result) => { if (!ignore) setTryOn(result); })
      .catch(() => { if (!ignore) setTryOn(null); });
    return () => { ignore = true; };
  }, [productId, selectedColor]);

  // Switch image when color changes
  useEffect(() => {
    if (!product || !selectedColor || !product.images) return;
    const matchIndex = product.images.findIndex(
      (img) => img.color_name?.toLowerCase() === selectedColor.toLowerCase(),
    );
    if (matchIndex >= 0) {
      setActiveImageIndex(matchIndex);
    }
  }, [selectedColor, product]);

  const handleAddToCart = () => {
    if (!product) return;
    if (isOutOfStock) {
      toast.error("This variant is currently out of stock.");
      return;
    }
    addToCart(product, quantity, selectedVariant?.id);
    toast.success("Added to your bag.");
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (isOutOfStock) {
      toast.error("This variant is currently out of stock.");
      return;
    }
    addToCart(product, quantity, selectedVariant?.id);
    router.push("/store/checkout");
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmittingReview(true);
    try {
      await apiPost(`/products/${product.id}/reviews`, {
        rating: newRating,
        fit_feedback: newFitFeedback,
        title: newTitle,
        comment: newComment,
      });
      toast.success("Thank you for your review!");
      setNewTitle("");
      setNewComment("");
      void fetchReviews(product.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to submit review";
      toast.error(msg);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-24 lg:pt-36">
        <Header />
        <main aria-busy="true" className="mx-auto grid max-w-[1440px] gap-8 px-5 py-12 md:grid-cols-2 md:px-10 lg:px-20">
          <div className="aspect-[4/5] bg-secondary motion-safe:animate-pulse" />
          <div className="space-y-5 pt-5"><p role="status" className="text-sm text-muted-foreground">Loading product...</p><div className="h-12 w-4/5 bg-secondary" /><div className="h-7 w-1/3 bg-secondary" /></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background pt-24 lg:pt-36">
        <Header />
        <main className="flex min-h-[65vh] flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">Product not found</h2>
        <p className="text-sm text-muted-foreground mb-6">{error ?? "This product does not exist or is no longer available."}</p>
        <button
          onClick={() => router.push("/store")}
          className="px-6 py-2.5 rounded-none bg-primary text-white font-semibold text-sm hover:bg-foreground transition-colors"
        >
          Back to store
        </button>
        </main>
        <Footer />
      </div>
    );
  }

  // vton_garment images are model inputs, not storefront gallery photos.
  const galleryImages = (product.images ?? []).filter((img) => img.kind !== "vton_garment");
  const images = galleryImages.length > 0 ? galleryImages : [{ id: "placeholder", url: product.image_url || DEFAULT_PRODUCT_PLACEHOLDER }];
  const mainImage = images[activeImageIndex] || images[0];
  const rating = reviewsData?.average_rating ?? product.rating_avg;
  const reviewCount = reviewsData?.total_reviews ?? product.review_count ?? 0;
  const fitBreakdown =
    reviewsData?.summary?.fit_feedback ??
    reviewsData?.fit_feedback ??
    reviewsData?.fit_breakdown;

  return (
    <div className="min-h-screen bg-background pt-24 lg:pt-36">
      <Header />
      {/* Breadcrumb & Navigation */}
      <div className="border-b border-border bg-background">
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 py-5 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Link href="/store">Home</Link>
            <span>/</span>
            <Link href="/store/collection">{product.category?.name || "Collection"}</Link>
            <span>/</span>
            <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
          </div>
        </div>
      </div>

      <main className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-20 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          {/* Gallery Column */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#F1ECE4]">
              <Image
                src={mainImage.url}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 55vw"
                className="object-cover transition-all duration-300"
              />
              <button type="button" onClick={() => setZoomOpen(true)} aria-label="Zoom product image" className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center border border-border bg-background/95 hover:bg-white"><ZoomIn className="h-4 w-4" /></button>
              {isOutOfStock && (
                <div className="absolute left-4 top-4 pointer-events-none">
                  <span className="bg-background/95 text-foreground text-[10px] uppercase tracking-wider px-4 py-2">
                    Out of stock
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={img.id || idx}
                    type="button"
                    aria-label={`View image ${idx + 1}`}
                    aria-pressed={activeImageIndex === idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-24 overflow-hidden shrink-0 border transition-all ${
                      activeImageIndex === idx
                        ? "border-foreground"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    <Image src={img.url} alt={`Thumbnail ${idx + 1}`} fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & Selection Column */}
          <div className="lg:col-span-5 flex flex-col lg:pt-3">
            {/* Header info */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
                  {product.brand || "TrueLook"}
                </span>
                {product.gender && (
                  <span className="text-xs text-muted-foreground font-medium capitalize">
                    · {product.gender === "male" ? "Men" : product.gender === "female" ? "Women" : "Unisex"}
                  </span>
                )}
              </div>

              <h1 className="text-4xl sm:text-5xl font-normal text-foreground tracking-[-0.025em] leading-[1.08] mb-5" style={{ fontFamily: "var(--font-display)" }}>
                {product.name}
              </h1>

              {/* Rating summary */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        rating != null && i < Math.floor(rating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-border"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-foreground">
                  {rating != null ? rating.toFixed(1) : "No reviews yet"}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({reviewCount} reviews)
                </span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <span className="text-xl font-normal text-foreground tracking-wide">
                  {formatCurrency(price)}
                </span>

              </div>
            </div>

            {/* Variant Selectors */}
            <div className="space-y-6 py-6 border-y border-border">
              {/* Color Selector */}
              {availableColors.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Color: <span className="font-semibold text-muted-foreground normal-case">{selectedColor}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {availableColors.map((col) => {
                      const isSelected = selectedColor === col.name;
                      return (
                        <button
                          key={col.name}
                          type="button"
                          aria-label={`Color ${col.name}`}
                          aria-pressed={isSelected}
                          onClick={() => setColor(col.name)}
                          className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-none text-xs font-semibold border transition-all cursor-pointer ${
                            isSelected
                              ? "border-primary bg-secondary text-primary "
                              : "border-border bg-background text-foreground hover:border-primary"
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10  shrink-0"
                            style={{ backgroundColor: col.hex || "#94a3b8" }}
                          />
                          <span>{col.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Selector */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Size: <span className="font-semibold text-muted-foreground normal-case">{selectedSize}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSizeChartOpen(true)}
                    className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" /> Size guide
                  </button>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {availableSizes.map((s) => {
                    const isSelected = selectedSize === s.size;
                    return (
                      <button
                        key={s.size}
                        type="button"
                        aria-label={`Size ${s.size}`}
                        aria-pressed={isSelected}
                        data-stock={s.inStock ? "in_stock" : "out_of_stock"}
                        onClick={() => setSize(s.size)}
                        className={`min-w-12 h-11 px-3.5 rounded-none text-xs font-bold border transition-all flex flex-col items-center justify-center cursor-pointer ${
                          !s.inStock
                            ? "border-border bg-secondary text-muted-foreground opacity-60 line-through"
                            : isSelected
                            ? "border-foreground bg-foreground text-white "
                            : "border-border bg-background text-foreground hover:border-primary"
                        }`}
                      >
                        {s.size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Quantity:
                </span>
                <div className="flex items-center border border-border rounded-none bg-background p-1">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center font-bold text-sm text-foreground">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={!selectedVariant || quantity >= getAvailableStock(selectedVariant)}
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-6 space-y-3">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 px-6 rounded-none bg-foreground text-white font-medium text-xs uppercase tracking-[0.1em] hover:bg-primary disabled:bg-slate-300 disabled:cursor-not-allowed transition-all  flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {isOutOfStock ? "Out of stock" : "Add to bag"}
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 px-6 rounded-none border border-foreground bg-background text-foreground font-medium text-xs uppercase tracking-[0.1em] hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all  flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4" /> Buy now
                </button>
              </div>

              {tryOn?.eligible === true && (
                <button type="button" onClick={() => setIsTryOnOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 border border-foreground text-[11px] uppercase tracking-[0.1em] hover:bg-secondary"><Sparkles className="h-4 w-4" />Virtual try-on</button>
              )}

              <button type="button" onClick={toggleWishlist} aria-label="Save product" aria-pressed={wishlisted} className="flex min-h-12 w-full items-center justify-center gap-2 border border-border text-[11px] uppercase tracking-[0.1em] hover:bg-secondary"><Heart className={"h-4 w-4 " + (wishlisted ? "fill-foreground" : "")} />{wishlisted ? "Saved to favorites" : "Save to favorites"}</button>
              <p className="pt-2 text-xs leading-6 text-muted-foreground">{product.description}</p>
            </div>

            {/* Fit Feedback Breakdown Widget */}
            {fitBreakdown && fitBreakdown.total_feedback > 0 && (
              <div className="p-4 bg-secondary rounded-none border border-border mt-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>Fit feedback</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({fitBreakdown.total_feedback} buyers)
                  </span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between font-semibold text-foreground mb-1">
                      <span>True to size</span>
                      <span>{fitBreakdown.true_to_size}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${fitBreakdown.true_to_size}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[11px] text-muted-foreground pt-1">
                    <div>Runs small: <strong className="text-foreground">{fitBreakdown.small}%</strong></div>
                    <div>Runs large: <strong className="text-foreground">{fitBreakdown.large}%</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Specifications & Reviews Tabs */}
        <section className="mt-16 pt-10 border-t border-border">
          <div className="flex items-center gap-6 border-b border-border pb-4 mb-8">
            <button
              aria-pressed={activeTab === "details"}
              onClick={() => setActiveTab("details")}
              className={`text-sm font-bold uppercase tracking-wider transition-colors pb-4 -mb-4.5 border-b-2 cursor-pointer ${
                activeTab === "details"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Details
            </button>
            <button
              aria-pressed={activeTab === "reviews"}
              onClick={() => setActiveTab("reviews")}
              className={`text-sm font-bold uppercase tracking-wider transition-colors pb-4 -mb-4.5 border-b-2 cursor-pointer ${
                activeTab === "reviews"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Reviews ({reviewsData?.total_reviews ?? 0})
            </button>
          </div>

          {activeTab === "details" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <details open className="border-b border-border pb-6">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] mb-4">Product description</summary>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line mb-6">
                  {product.description || "No detailed description available."}
                </p>
              </details>
              <details open className="border-b border-border pb-6">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] mb-4">Materials & care</summary>
                <dl className="divide-y divide-border text-xs">
                  {product.material && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-muted-foreground font-medium">Material</dt>
                      <dd className="font-bold text-foreground">{product.material}</dd>
                    </div>
                  )}
                  {product.fit && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-muted-foreground font-medium">Fit</dt>
                      <dd className="font-bold text-foreground">{product.fit}</dd>
                    </div>
                  )}
                  {product.care_instructions && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-muted-foreground font-medium">Care</dt>
                      <dd className="font-bold text-foreground text-right max-w-xs">{product.care_instructions}</dd>
                    </div>
                  )}
                  {selectedVariant?.sku && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-muted-foreground font-medium">SKU</dt>
                      <dd className="font-mono text-foreground">{selectedVariant.sku}</dd>
                    </div>
                  )}
                </dl>
              </details>
              <details className="border-b border-border pb-6 md:col-span-2"><summary className="cursor-pointer text-xs uppercase tracking-[0.14em]">Shipping & returns</summary><p className="mt-4 text-sm leading-6 text-muted-foreground">This demo store does not process real deliveries. Product details and variant choices let you explore the shopping experience.</p></details>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Reviews List */}
              <div className="lg:col-span-7 space-y-4">
                {(reviewsData?.items ?? reviewsData?.reviews ?? []).length > 0 ? (
                  (reviewsData?.items ?? reviewsData?.reviews ?? []).map((rev) => (
                    <div key={rev.id} className="p-5 rounded-none border border-border bg-background ">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-foreground">{rev.user_name}</span>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < rev.rating ? "text-amber-400 fill-amber-400" : "text-border"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {rev.fit_feedback && (
                        <span className="inline-block text-[10px] font-bold text-primary bg-secondary px-2 py-0.5 rounded-md mb-2">
                          Fit: {rev.fit_feedback === "small" ? "Runs small" : rev.fit_feedback === "large" ? "Runs large" : "True to size"}
                        </span>
                      )}
                      {rev.title && <h5 className="font-bold text-sm text-foreground mb-1">{rev.title}</h5>}
                      <p className="text-xs text-muted-foreground leading-relaxed">{rev.comment}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-6">No reviews for this product yet.</p>
                )}
              </div>

              {/* Submit Review */}
              <div className="lg:col-span-5 bg-secondary/40 p-6 rounded-none border border-border">
                <h4 className="font-bold text-foreground mb-4 text-base">Write your review</h4>
                <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-foreground mb-1.5">Star rating</label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          aria-label={`${star} stars`}
                          aria-pressed={newRating === star}
                          onClick={() => setNewRating(star)}
                          className="flex h-11 w-11 items-center justify-center"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= newRating ? "text-amber-400 fill-amber-400" : "text-muted-foreground"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-foreground mb-1.5">How does it fit?</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["small", "true_to_size", "large"] as const).map((fit) => (
                        <button
                          key={fit}
                          type="button"
                          aria-pressed={newFitFeedback === fit}
                          onClick={() => setNewFitFeedback(fit)}
                          className={`py-2 px-2 rounded-none text-center font-bold border transition-all ${
                            newFitFeedback === fit
                              ? "bg-primary border-primary text-white"
                              : "bg-background border-border text-foreground hover:border-primary"
                          }`}
                        >
                          {fit === "small" ? "Small" : fit === "large" ? "Large" : "True to size"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="review-title" className="block font-bold text-foreground mb-1">Title</label>
                    <input
                      id="review-title"
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Summarize your experience..."
                      className="w-full px-3 py-2 bg-background rounded-none border border-border focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label htmlFor="review-comment" className="block font-bold text-foreground mb-1">Comment</label>
                    <textarea
                      id="review-comment"
                      rows={3}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Share your thoughts on fabric, finish, and comfort..."
                      className="w-full px-3 py-2 bg-background rounded-none border border-border focus:outline-none focus:border-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="w-full py-3 rounded-none bg-primary text-white font-bold text-xs hover:bg-foreground disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submittingReview ? "Submitting..." : "Submit review"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
        {relatedProducts.length > 0 && <section className="mt-20 border-t border-border pt-12"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">THE NEXT DISCOVERY</p><h2 className="text-4xl font-normal" style={{ fontFamily: "var(--font-display)" }}>You may also like</h2></div><Link href="/store/collection" className="text-xs underline underline-offset-4">Explore the collection</Link></div><div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">{relatedProducts.map(item => <Link key={item.id} href={"/store/products/" + (item.slug || item.id)} className="group"><div className="relative aspect-[4/5] overflow-hidden bg-secondary"><Image src={getProductImageUrl(item)} alt={item.name} fill sizes="(max-width: 640px) 45vw, 25vw" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" /></div><h3 className="mt-4 text-lg" style={{ fontFamily: "var(--font-display)" }}>{item.name}</h3><p className="mt-2 text-xs">{formatCurrency(item.price, item.currency)}</p></Link>)}</div></section>}
      </main>

      <Footer />

      {tryOn?.eligible === true && (
        <TryOnModal
          isOpen={isTryOnOpen}
          onClose={() => setIsTryOnOpen(false)}
          productId={product.id}
          productName={product.name}
          variantId={selectedVariant?.id}
          colorName={selectedColor ?? undefined}
          eligibility={tryOn}
        />
      )}


      {zoomOpen && <StoreDialog open onClose={() => setZoomOpen(false)} title={product.name} description="Image detail · Scroll to explore, press Escape to close" wide><div className="relative min-h-0 flex-1 overflow-auto bg-secondary"><div className="relative aspect-[4/5] w-full min-w-[1000px]"><Image src={mainImage.url} alt={product.name + " · zoomed"} fill sizes="90vw" className="object-contain" /></div></div></StoreDialog>}

      {/* Size Chart Modal */}
      <SizeChartModal
        isOpen={isSizeChartOpen}
        onClose={() => setIsSizeChartOpen(false)}
        sizeChart={product.size_chart}
        categoryName={product.category?.name}
      />
    </div>
  );
}
