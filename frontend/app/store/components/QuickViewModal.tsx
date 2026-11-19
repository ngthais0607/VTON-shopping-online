"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Minus, Plus, Star, ArrowUpRight } from "lucide-react";
import { StoreDialog } from "@/components/store/store-dialog";
import type { Product, ReviewSummary } from "@/lib/types";
import { useCart } from "../context/CartContext";
import { apiGet, apiPost } from "@/lib/api";
import { getAvailableStock } from "@/lib/inventory";
import { useVariantSelection } from "@/hooks/use-variant-selection";
import { formatCurrency } from "@/lib/utils";
import { getProductImageUrl } from "@/lib/placeholder-images";
interface QuickViewModalProps { product: Product; onClose: () => void; }
export function QuickViewModal({ product, onClose }: QuickViewModalProps) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "reviews">("details");
  const [reviewsData, setReviewsData] = useState<ReviewSummary>({ average_rating: null, total_reviews: 0, reviews: [] });
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState("");
  const [newComment, setNewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { selectedColor, selectedSize, selectedVariant, availableColors, availableSizes, isOutOfStock, price, setColor, setSize } = useVariantSelection({ variants: product.variants ?? [], defaultPrice: product.price });
  const effectiveStock = selectedVariant ? getAvailableStock(selectedVariant) : getAvailableStock(product);
  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true);
    try { setReviewsData(await apiGet<ReviewSummary>("/products/" + product.id + "/reviews")); }
    catch (err) { setReviewMsg({ type: "error", text: err instanceof Error ? err.message : "Unable to load reviews." }); }
    finally { setLoadingReviews(false); }
  }, [product.id]);
  useEffect(() => { void fetchReviews(); }, [fetchReviews]);
  const add = () => { if (isOutOfStock) return; addToCart(product, quantity, selectedVariant?.id); setAdded(true); };
  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmittingReview(true); setReviewMsg(null);
    try { await apiPost("/products/" + product.id + "/reviews", { rating: newRating, title: newTitle, comment: newComment }); setReviewMsg({ type: "success", text: "Thank you! Your review has been submitted." }); setNewTitle(""); setNewComment(""); void fetchReviews(); }
    catch (err) { setReviewMsg({ type: "error", text: err instanceof Error ? err.message : "Unable to submit your review. Please sign in." }); }
    finally { setSubmittingReview(false); }
  };
  const selectClass = (selected: boolean) => "min-h-11 min-w-11 border px-3 text-xs " + (selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary");
  return <StoreDialog open onClose={onClose} title="A closer look." description={product.category?.name || "TrueLook · Collection"} wide>
    <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
      <div className="mb-6 flex gap-6 border-b border-border"><button onClick={() => setActiveTab("details")} aria-pressed={activeTab === "details"} className={activeTab === "details" ? "min-h-11 border-b-2 border-primary text-sm text-primary" : "min-h-11 text-sm text-muted-foreground"}>Product details</button><button onClick={() => setActiveTab("reviews")} aria-pressed={activeTab === "reviews"} className={activeTab === "reviews" ? "min-h-11 border-b-2 border-primary text-sm text-primary" : "min-h-11 text-sm text-muted-foreground"}>Reviews ({reviewsData.total_reviews})</button></div>
      {activeTab === "details" ? <div className="grid items-start gap-7 sm:grid-cols-2">
        <div className="relative aspect-[4/5] overflow-hidden bg-secondary"><Image src={getProductImageUrl(product)} alt={product.name} fill sizes="(max-width: 640px) 85vw, 340px" className="object-cover" /></div>
        <div><p className="text-[10px] uppercase tracking-widest text-primary">{product.brand || "TrueLook"}</p><h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{product.name}</h3><p className="mt-4 text-xl font-semibold">{formatCurrency(price, product.currency)}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">{product.description || "Explore details and choose your variant on the product page."}</p>
          {!!availableColors.length && <fieldset className="mt-5"><legend className="mb-2 text-xs">Color · {selectedColor}</legend><div className="flex flex-wrap gap-2">{availableColors.map(color => <button key={color.name} type="button" aria-label={"Color " + color.name} aria-pressed={selectedColor === color.name} onClick={() => { setColor(color.name); setAdded(false); }} className={selectClass(selectedColor === color.name)}>{color.name}</button>)}</div></fieldset>}
          {!!availableSizes.length && <fieldset className="mt-5"><legend className="mb-2 text-xs">Size · {selectedSize}</legend><div className="flex flex-wrap gap-2">{availableSizes.map(size => <button key={size.size} type="button" aria-label={"Size " + size.size} aria-pressed={selectedSize === size.size} data-stock={size.inStock ? "in_stock" : "out_of_stock"} onClick={() => { setSize(size.size); setAdded(false); }} className={selectClass(selectedSize === size.size) + (size.inStock ? "" : " line-through opacity-50")}>{size.size}</button>)}</div></fieldset>}
          <div className="mt-5 border-t border-border pt-5">{product.variants?.length ? <><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{effectiveStock <= 0 ? "Out of stock" : "Available: " + effectiveStock + " items"}</span><div className="flex items-center border border-border"><button aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity(q => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center disabled:opacity-30"><Minus className="h-3 w-3" /></button><span className="w-6 text-center text-xs">{quantity}</span><button aria-label="Increase quantity" disabled={quantity >= effectiveStock} onClick={() => setQuantity(q => Math.min(effectiveStock, q + 1))} className="flex h-10 w-10 items-center justify-center disabled:opacity-30"><Plus className="h-3 w-3" /></button></div></div><button disabled={effectiveStock <= 0 || added || isOutOfStock} onClick={add} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">{added ? <><Check className="h-4 w-4" />Added to bag</> : "Add to bag · " + formatCurrency(price * quantity, product.currency)}</button></> : <p className="text-xs leading-6 text-muted-foreground">Open the product page to choose your size and color and check availability.</p>}
          <Link href={"/store/products/" + (product.slug || product.id)} className="mt-3 flex min-h-11 items-center justify-between text-sm text-primary">View product details <ArrowUpRight className="h-4 w-4" /></Link></div>
        </div>
      </div> : <div className="space-y-7">
        <p className="text-sm text-muted-foreground">{reviewsData.average_rating == null ? "No reviews yet." : reviewsData.average_rating + " / 5 · " + reviewsData.total_reviews + " reviews"}</p>
        {reviewMsg && <p role={reviewMsg.type === "error" ? "alert" : "status"} className={reviewMsg.type === "error" ? "border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" : "border border-primary/20 bg-secondary p-3 text-sm text-primary"}>{reviewMsg.text}</p>}
        <form onSubmit={submitReview} className="space-y-4 border border-border p-5"><h4 className="text-lg font-semibold">Share your experience</h4><fieldset><legend className="mb-2 text-xs text-muted-foreground">Star rating</legend><div className="flex gap-1">{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" aria-label={star + " stars"} aria-pressed={newRating === star} onClick={() => setNewRating(star)} className="flex h-11 w-11 items-center justify-center"><Star className={star <= newRating ? "h-5 w-5 fill-primary text-primary" : "h-5 w-5 text-muted-foreground"} /></button>)}</div></fieldset><label className="block text-xs">Title<input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm" /></label><label className="block text-xs">Comment<textarea required rows={3} value={newComment} onChange={e => setNewComment(e.target.value)} className="mt-2 w-full border border-border bg-background p-3 text-sm" /></label><button disabled={submittingReview} className="min-h-11 bg-primary px-5 text-sm text-primary-foreground disabled:opacity-50">{submittingReview ? "Submitting..." : "Submit review"}</button></form>
        {loadingReviews ? <p role="status" className="text-sm text-muted-foreground">Loading reviews...</p> : <div className="divide-y divide-border">{(reviewsData.items ?? reviewsData.reviews ?? []).map(review => <article key={review.id} className="py-5"><div className="flex flex-wrap items-center justify-between gap-3 text-xs"><span className="font-medium">{review.user_name}{review.is_verified_purchase && <span className="ml-2 text-primary">Verified purchase</span>}</span><span>{review.rating} / 5</span></div>{review.title && <h5 className="mt-3 text-sm font-medium">{review.title}</h5>}<p className="mt-2 text-sm leading-6 text-muted-foreground">{review.comment}</p></article>)}</div>}
      </div>}
    </div>
  </StoreDialog>;
}
