"use client";

import React, { useState, useEffect } from "react";
import { Product } from "@/lib/types";
import { useCart } from "../context/CartContext";
import { X, Star, ShoppingCart, Plus, Minus, Check, ShieldCheck, Truck, MessageSquare, ThumbsUp, CheckCircle2, Send, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";

interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
}

interface Review {
  id: number;
  user_name: string;
  rating: number;
  title?: string;
  comment?: string;
  is_verified_purchase: boolean;
  created_at?: string;
}

interface ProductReviewsData {
  average_rating: number;
  total_reviews: number;
  reviews: Review[];
}

export function QuickViewModal({ product, onClose }: QuickViewModalProps) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'reviews'>('details');

  // Reviews state
  const [reviewsData, setReviewsData] = useState<ProductReviewsData>({
    average_rating: 5.0,
    total_reviews: 0,
    reviews: []
  });
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Review submission state
  const [newRating, setNewRating] = useState(5);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const availableStock = product.stock_quantity - product.reserved_quantity;
  const imageUrl = product.images && product.images.length > 0 ? product.images[0].url : undefined;

  useEffect(() => {
    fetchReviews();
  }, [product.id]);

  const fetchReviews = async () => {
    setLoadingReviews(true);
    try {
      const data = await apiGet<ProductReviewsData>(`/products/${product.id}/reviews`);
      setReviewsData(data);
    } catch (err) {
      console.error('Failed to load product reviews', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1000);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    setReviewMsg(null);
    try {
      await apiPost(`/products/${product.id}/reviews`, {
        rating: newRating,
        title: newTitle,
        comment: newComment
      });
      setReviewMsg({ type: 'success', text: 'Thank you! Your review has been published.' });
      setNewTitle('');
      setNewComment('');
      fetchReviews();
    } catch (err: any) {
      setReviewMsg({ type: 'error', text: err.message || 'Failed to submit review. Please sign in.' });
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header Tabs */}
          <div className="flex border-b border-slate-100 bg-sky-50/40 px-6 pt-4 gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-3 text-sm font-bold border-b-2 transition ${
                activeTab === 'details'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Product Details
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'reviews'
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Customer Reviews ({reviewsData.total_reviews})</span>
            </button>
          </div>

          <div className="overflow-y-auto p-6 flex-1">
            {activeTab === 'details' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Image Column */}
                <div className="relative bg-slate-100 rounded-2xl h-64 md:h-80 flex items-center justify-center overflow-hidden">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="text-slate-400 font-bold text-sm">No Image Available</div>
                  )}
                  {product.category && (
                    <span className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-700 shadow-xs">
                      {product.category.name}
                    </span>
                  )}
                </div>

                {/* Info Column */}
                <div className="flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 leading-snug">{product.name}</h3>
                    <p className="text-2xl font-bold text-sky-600 mt-2">${product.price.toLocaleString()}</p>
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <div className="flex text-amber-400">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < Math.round(reviewsData.average_rating)
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <span>{reviewsData.average_rating} ({reviewsData.total_reviews} reviews)</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-4 leading-relaxed">
                      {product.description || "High quality product crafted with precision and style. Perfect for everyday use."}
                    </p>

                    {/* Stock Badge */}
                    <div className="mt-4 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          availableStock <= 0
                            ? "bg-rose-50 text-rose-600 border border-rose-100"
                            : availableStock < 10
                            ? "bg-amber-50 text-amber-600 border border-amber-100"
                            : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        }`}
                      >
                        {availableStock <= 0
                          ? "Out of Stock"
                          : availableStock < 10
                          ? `Only ${availableStock} left in stock`
                          : `In Stock (${availableStock} available)`}
                      </span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Quantity</span>
                      <div className="flex items-center gap-2 bg-sky-50 rounded-xl p-1">
                        <button
                          disabled={quantity <= 1}
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 shadow-xs"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-slate-800">{quantity}</span>
                        <button
                          disabled={quantity >= availableStock}
                          onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-slate-600 disabled:opacity-40 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5 bg-sky-50/60 p-2 rounded-lg">
                        <Truck className="w-3.5 h-3.5 text-sky-600" />
                        <span>Fast Delivery</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-sky-50/60 p-2 rounded-lg">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Verified Quality</span>
                      </div>
                    </div>

                    <Button
                      disabled={availableStock <= 0 || added}
                      onClick={handleAddToCart}
                      className="w-full h-11 bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white font-bold rounded-xl shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                      {added ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>Added to Cart!</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          <span>Add to Cart · ${(product.price * quantity).toLocaleString()}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* REVIEWS TAB */
              <div className="space-y-6">
                {/* Rating Overview */}
                <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900">{reviewsData.average_rating}</span>
                      <span className="text-sm font-semibold text-slate-500">out of 5.0</span>
                    </div>
                    <div className="flex text-amber-400 mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.round(reviewsData.average_rating)
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-sky-700 block">{reviewsData.total_reviews} Reviews</span>
                    <span className="text-xs text-slate-500">100% Authentic Feedback</span>
                  </div>
                </div>

                {/* Review Submission Form */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Write a Review</h4>
                  {reviewMsg && (
                    <div
                      className={`mb-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
                        reviewMsg.type === 'success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {reviewMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>{reviewMsg.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmitReview} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Your Rating</label>
                      <div className="flex gap-1 text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setNewRating(star)}
                            className="p-1 transition transform hover:scale-110"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= newRating ? "fill-amber-400 text-amber-400" : "text-slate-300"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Review Title (e.g., Excellent quality!)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>

                    <div>
                      <textarea
                        rows={2}
                        placeholder="Write your feedback..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingReview ? 'Submitting...' : 'Submit Review'}</span>
                    </button>
                  </form>
                </div>

                {/* Review List */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-800">Customer Feedback</h4>
                  {loadingReviews ? (
                    <div className="py-6 text-center text-xs text-slate-400">Loading reviews...</div>
                  ) : reviewsData.reviews.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No reviews yet. Be the first to review this product!
                    </div>
                  ) : (
                    reviewsData.reviews.map((rev) => (
                      <div key={rev.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{rev.user_name}</span>
                            {rev.is_verified_purchase && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                <CheckCircle2 className="w-3 h-3 text-sky-600" /> Verified Buyer
                              </span>
                            )}
                          </div>
                          <div className="flex text-amber-400">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${
                                  i < rev.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {rev.title && <p className="text-xs font-semibold text-slate-800">{rev.title}</p>}
                        {rev.comment && <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
