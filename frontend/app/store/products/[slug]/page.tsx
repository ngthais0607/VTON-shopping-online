"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  Heart,
  Minus,
  Plus,
  Ruler,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { SizeChartModal } from "@/components/store/size-chart-modal";
import { useVariantSelection } from "@/hooks/use-variant-selection";
import { apiGet, apiPost } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_PRODUCT_PLACEHOLDER } from "@/lib/placeholder-images";
import type { FitFeedbackType, Product, ReviewSummary } from "@/lib/types";
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
  const [isSizeChartOpen, setIsSizeChartOpen] = useState(false);
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
      setError(err instanceof Error ? err.message : "Không thể tải sản phẩm");
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
      toast.error("Phiên bản này hiện đã hết hàng!");
      return;
    }
    addToCart(product, quantity, selectedVariant?.id);
    toast.success("Đã thêm vào giỏ hàng thành công!");
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (isOutOfStock) {
      toast.error("Phiên bản này hiện đã hết hàng!");
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
      toast.success("Cảm ơn bạn đã gửi đánh giá!");
      setNewTitle("");
      setNewComment("");
      void fetchReviews(product.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gửi đánh giá thất bại";
      toast.error(msg);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Không tìm thấy sản phẩm</h2>
        <p className="text-sm text-slate-500 mb-6">{error ?? "Sản phẩm không tồn tại hoặc đã ngừng bán."}</p>
        <button
          onClick={() => router.push("/store")}
          className="px-6 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 transition-colors"
        >
          Quay lại cửa hàng
        </button>
      </div>
    );
  }

  const images = product.images?.length > 0 ? product.images : [{ id: "placeholder", url: DEFAULT_PRODUCT_PLACEHOLDER }];
  const mainImage = images[activeImageIndex] || images[0];
  const fitBreakdown = reviewsData?.fit_breakdown;

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb & Navigation */}
      <div className="border-b border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-sky-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </button>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Trang chủ</span>
            <span>/</span>
            <span>{product.category?.name || "Bộ sưu tập"}</span>
            <span>/</span>
            <span className="text-slate-900 font-medium truncate max-w-[200px]">{product.name}</span>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Gallery Column */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="relative aspect-square w-full rounded-3xl overflow-hidden bg-slate-100 border border-slate-200/80 shadow-xs">
              <Image
                src={mainImage.url}
                alt={product.name}
                fill
                priority
                className="object-cover transition-all duration-300"
              />
              {isOutOfStock && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                  <span className="bg-rose-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl shadow-lg">
                    Tạm hết hàng
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
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 transition-all ${
                      activeImageIndex === idx
                        ? "border-sky-500 ring-2 ring-sky-200"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Image src={img.url} alt={`Thumbnail ${idx + 1}`} fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & Selection Column */}
          <div className="lg:col-span-5 flex flex-col">
            {/* Header info */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200/70 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {product.brand || "TrueLook"}
                </span>
                {product.gender && (
                  <span className="text-xs text-slate-500 font-medium capitalize">
                    · {product.gender === "male" ? "Nam" : product.gender === "female" ? "Nữ" : "Unisex"}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug mb-3">
                {product.name}
              </h1>

              {/* Rating summary */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        reviewsData?.average_rating && i < Math.floor(reviewsData.average_rating)
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-700">
                  {reviewsData?.average_rating ? reviewsData.average_rating.toFixed(1) : "Chưa có đánh giá"}
                </span>
                <span className="text-xs text-slate-400">
                  ({reviewsData?.total_reviews ?? 0} đánh giá)
                </span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {formatCurrency(price)}
                </span>
                {selectedVariant?.price && selectedVariant.price !== product.price && (
                  <span className="text-sm text-slate-400 line-through">
                    {formatCurrency(product.price)}
                  </span>
                )}
              </div>
            </div>

            {/* Variant Selectors */}
            <div className="space-y-6 py-6 border-y border-slate-100">
              {/* Color Selector */}
              {availableColors.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Màu sắc: <span className="font-semibold text-slate-600 normal-case">{selectedColor}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {availableColors.map((col) => {
                      const isSelected = selectedColor === col.name;
                      return (
                        <button
                          key={col.name}
                          type="button"
                          aria-label={`Màu ${col.name}`}
                          onClick={() => setColor(col.name)}
                          className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border-2 transition-all cursor-pointer ${
                            isSelected
                              ? "border-sky-500 bg-sky-50/50 text-sky-900 shadow-xs"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-xs shrink-0"
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
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Kích cỡ: <span className="font-semibold text-slate-600 normal-case">{selectedSize}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSizeChartOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 transition-colors cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" /> Bảng size
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
                        data-stock={s.inStock ? "in_stock" : "out_of_stock"}
                        onClick={() => setSize(s.size)}
                        className={`min-w-12 h-11 px-3.5 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center justify-center cursor-pointer ${
                          !s.inStock
                            ? "border-slate-200 bg-slate-100 text-slate-400 opacity-60 line-through"
                            : isSelected
                            ? "border-sky-500 bg-sky-500 text-white shadow-md shadow-sky-500/25"
                            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
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
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Số lượng:
                </span>
                <div className="flex items-center border border-slate-200 rounded-xl bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center font-bold text-sm text-slate-900">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-6 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md shadow-slate-900/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {isOutOfStock ? "Tạm hết hàng" : "Thêm vào giỏ hàng"}
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-600 text-white font-bold text-sm hover:from-sky-600 hover:to-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4" /> Mua ngay
                </button>
              </div>

              {/* Guarantees */}
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <Truck className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Giao hàng toàn quốc</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Đổi trả 30 ngày chuẩn TrueLook</span>
                </div>
              </div>
            </div>

            {/* Fit Feedback Breakdown Widget */}
            {fitBreakdown && fitBreakdown.total_feedback > 0 && (
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-100 mt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>Phản hồi form dáng thực tế</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({fitBreakdown.total_feedback} người mua)
                  </span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between font-semibold text-slate-700 mb-1">
                      <span>Chuẩn size</span>
                      <span>{fitBreakdown.true_to_size}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${fitBreakdown.true_to_size}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-500 pt-1">
                    <div>Nhỏ hơn: <strong className="text-slate-700">{fitBreakdown.small}%</strong></div>
                    <div>Rộng hơn: <strong className="text-slate-700">{fitBreakdown.large}%</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Specifications & Reviews Tabs */}
        <section className="mt-16 pt-10 border-t border-slate-200">
          <div className="flex items-center gap-6 border-b border-slate-200 pb-4 mb-8">
            <button
              onClick={() => setActiveTab("details")}
              className={`text-sm font-bold uppercase tracking-wider transition-colors pb-4 -mb-4.5 border-b-2 cursor-pointer ${
                activeTab === "details"
                  ? "border-sky-600 text-sky-600"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              Thông tin chi tiết
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`text-sm font-bold uppercase tracking-wider transition-colors pb-4 -mb-4.5 border-b-2 cursor-pointer ${
                activeTab === "reviews"
                  ? "border-sky-600 text-sky-600"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              Đánh giá ({reviewsData?.total_reviews ?? 0})
            </button>
          </div>

          {activeTab === "details" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <div>
                <h3 className="font-bold text-slate-900 mb-3 text-base">Mô tả sản phẩm</h3>
                <p className="text-slate-600 leading-relaxed whitespace-pre-line mb-6">
                  {product.description || "Chưa có mô tả chi tiết."}
                </p>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h3 className="font-bold text-slate-900 mb-4 text-base">Đặc tính kỹ thuật</h3>
                <dl className="divide-y divide-slate-200/60 text-xs">
                  {product.material && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-slate-500 font-medium">Chất liệu</dt>
                      <dd className="font-bold text-slate-900">{product.material}</dd>
                    </div>
                  )}
                  {product.fit && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-slate-500 font-medium">Form dáng</dt>
                      <dd className="font-bold text-slate-900">{product.fit}</dd>
                    </div>
                  )}
                  {product.care_instructions && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-slate-500 font-medium">Bảo quản</dt>
                      <dd className="font-bold text-slate-900 text-right max-w-xs">{product.care_instructions}</dd>
                    </div>
                  )}
                  {selectedVariant?.sku && (
                    <div className="py-2.5 flex justify-between">
                      <dt className="text-slate-500 font-medium">Mã SKU</dt>
                      <dd className="font-mono text-slate-700">{selectedVariant.sku}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Reviews List */}
              <div className="lg:col-span-7 space-y-4">
                {reviewsData?.reviews && reviewsData.reviews.length > 0 ? (
                  reviewsData.reviews.map((rev) => (
                    <div key={rev.id} className="p-5 rounded-2xl border border-slate-100 bg-white shadow-2xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-900">{rev.user_name}</span>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < rev.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      {rev.fit_feedback && (
                        <span className="inline-block text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md mb-2">
                          Form dáng: {rev.fit_feedback === "small" ? "Nhỏ hơn" : rev.fit_feedback === "large" ? "Rộng hơn" : "Chuẩn size"}
                        </span>
                      )}
                      {rev.title && <h5 className="font-bold text-sm text-slate-800 mb-1">{rev.title}</h5>}
                      <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 py-6">Chưa có đánh giá nào cho sản phẩm này.</p>
                )}
              </div>

              {/* Submit Review */}
              <div className="lg:col-span-5 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <h4 className="font-bold text-slate-900 mb-4 text-base">Viết đánh giá của bạn</h4>
                <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">Đánh giá sao</label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setNewRating(star)}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= newRating ? "text-amber-400 fill-amber-400" : "text-slate-300"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">Form dáng thực tế</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["small", "true_to_size", "large"] as const).map((fit) => (
                        <button
                          key={fit}
                          type="button"
                          onClick={() => setNewFitFeedback(fit)}
                          className={`py-2 px-2 rounded-xl text-center font-bold border transition-all ${
                            newFitFeedback === fit
                              ? "bg-sky-500 border-sky-500 text-white"
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {fit === "small" ? "Nhỏ" : fit === "large" ? "Rộng" : "Chuẩn"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tiêu đề</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Tóm tắt trải nghiệm..."
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nhận xét</label>
                    <textarea
                      rows={3}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Chia sẻ về chất vải, độ hoàn thiện, cảm giác mặc..."
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="w-full py-3 rounded-xl bg-sky-600 text-white font-bold text-xs hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {submittingReview ? "Đang gửi..." : "Gửi đánh giá"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>

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
