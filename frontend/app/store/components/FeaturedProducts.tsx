"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Star, Zap, Heart, Check, X, Plus, Minus, Package } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { Product as DBProduct, User } from "@/lib/types";
import { apiGet, apiPost } from "@/lib/api";
import { QuickViewModal } from "./QuickViewModal";

interface ProductUI {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  stock: number;
  badge?: string;
  badgeColor?: string;
  img: string;
  description: string;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white border border-border overflow-hidden animate-pulse">
      <div className="aspect-square bg-slate-100" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-slate-100 rounded-full w-1/3" />
        <div className="h-4 bg-slate-100 rounded-full w-2/3" />
        <div className="h-3 bg-slate-100 rounded-full w-1/2" />
        <div className="h-9 bg-slate-100 rounded-xl mt-3" />
      </div>
    </div>
  );
}

// FeaturedProductsProps interface is defined below

interface PurchaseModalProps {
  product: ProductUI;
  currentUser: User | null;
  onClose: () => void;
  onOrderSuccess: () => void;
}

function PurchaseModal({ product, currentUser, onClose, onOrderSuccess }: PurchaseModalProps) {
  const [qty, setQty] = useState(1);
  const [success, setSuccess] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const router = useRouter();

  async function handlePurchase() {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    setOrdering(true);
    try {
      await apiPost("/orders/", {
        product_id: product.id,
        quantity: qty,
        user_id: currentUser?.id || null
      });
      setSuccess(true);
      onOrderSuccess();
    } catch (err: any) {
      alert(err.message || "Failed to place order.");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-10 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-foreground mb-2" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.25rem" }}>
                Order Placed!
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                {qty}x {product.name} has been added to your order. You can view it in the Admin Dashboard.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 text-white text-sm font-medium hover:from-sky-600 hover:to-cyan-700 shadow-md shadow-sky-500/20 transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </motion.div>
          ) : (
            <motion.div key="form">
              {/* Header */}
              <div className="relative">
                <div className="h-52 bg-slate-100 overflow-hidden relative">
                  <Image src={product.img} alt={product.name} fill className="object-cover" />
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 text-foreground" />
                </button>
                {product.badge && (
                  <span className={`absolute top-3 left-3 text-xs px-2.5 py-1 rounded-full font-medium ${product.badgeColor}`}>
                    {product.badge}
                  </span>
                )}
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{product.category}</p>
                  <h3 className="text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem" }}>
                    {product.name}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i < Math.floor(product.rating) ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{product.rating} ({product.reviews.toLocaleString()} reviews)</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${product.stock < 10 ? "bg-rose-50 text-rose-600 font-bold" : "bg-emerald-50 text-emerald-600 font-bold"}`}>
                    {product.stock <= 0 ? "Out of stock" : product.stock < 10 ? `Only ${product.stock} left` : `${product.stock} in stock`}
                  </span>
                </div>

                {/* Quantity */}
                <div className="flex items-center justify-between py-3 border-y border-sky-100">
                  <span className="text-sm text-slate-800 font-medium">Quantity</span>
                  <div className="flex items-center gap-3">
                    <button
                      disabled={qty <= 1}
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-100 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer text-sky-800"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-slate-900">{qty}</span>
                    <button
                      disabled={qty >= product.stock}
                      onClick={() => setQty(Math.min(product.stock, qty + 1))}
                      className="w-8 h-8 rounded-lg bg-sky-50 hover:bg-sky-100 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer text-sky-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal ({qty} item{qty > 1 ? "s" : ""})</span>
                    <span className="text-slate-900 font-medium">${(product.price * qty).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Shipping</span>
                    <span className="text-emerald-600 font-medium">Free</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-sky-100">
                    <span className="text-slate-900 font-semibold">Total</span>
                    <div className="text-right">
                      <span className="text-sky-600 font-bold text-lg">${(product.price * qty).toLocaleString()}</span>
                      {product.originalPrice && (
                        <span className="block text-xs text-slate-400 line-through">
                          ${(product.originalPrice * qty).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  disabled={ordering || product.stock <= 0}
                  onClick={handlePurchase}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white text-sm font-medium flex items-center justify-center gap-2 shadow-md shadow-sky-500/25 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none active:scale-[0.98] transition-all cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {ordering ? "Processing..." : `Purchase · $${(product.price * qty).toLocaleString()}`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
import { Eye } from "lucide-react";

interface ProductCardProps {
  product: ProductUI;
  onBuy: (p: ProductUI) => void;
  onQuickView: (p: ProductUI) => void;
  index: number;
}

function ProductCard({ product, onBuy, onQuickView, index }: ProductCardProps) {
  const [liked, setLiked] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="group bg-white rounded-2xl border border-border overflow-hidden hover:shadow-[0_8px_40px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
    >
      <div className="relative aspect-square bg-slate-50 overflow-hidden">
        <Image
          src={product.img}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {product.badge && (
          <span className={`absolute top-3 left-3 text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-xl shadow-sm ${product.badgeColor}`}>
            {product.badge}
          </span>
        )}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            onClick={() => onQuickView(product)}
            className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-sm text-slate-600 hover:text-sky-600"
            title="Quick View"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setLiked(!liked)}
            className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center transition-all hover:scale-110 active:scale-90 cursor-pointer shadow-sm"
          >
            <Heart className={`w-4 h-4 ${liked ? "fill-rose-500 text-rose-500" : "text-slate-400"}`} />
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-[10px] uppercase font-bold text-sky-600 tracking-wider mb-1">{product.category}</p>
          <h3 className="text-foreground text-sm font-semibold mb-2 leading-snug line-clamp-1">{product.name}</h3>

          <div className="flex items-center gap-1.5 mb-3">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-3 h-3 ${i < Math.floor(product.rating) ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">({product.reviews.toLocaleString()})</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-slate-900 font-bold text-base">${product.price}</span>
              {product.originalPrice && (
                <span className="text-xs text-slate-400 line-through ml-1.5">${product.originalPrice}</span>
              )}
            </div>
            <span className={`text-xs font-semibold ${product.stock <= 0 ? "text-rose-500" : product.stock < 10 ? "text-amber-600" : "text-emerald-600"}`}>
              {product.stock <= 0 ? "Out of stock" : product.stock < 10 ? `${product.stock} left` : "In stock"}
            </span>
          </div>

          <button
            disabled={product.stock <= 0}
            onClick={() => onBuy(product)}
            className="w-full py-2.5 rounded-xl bg-sky-50 text-sky-800 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-sky-600 hover:text-white group-hover:bg-sky-600 group-hover:text-white transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-4 h-4" />
            {product.stock <= 0 ? "Sold Out" : "Quick Buy"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface FeaturedProductsProps {
  products: DBProduct[];
  loading: boolean;
  currentUser: User | null;
  onOrderSuccess: () => void;
  currentPage: number;
  pageSize: number;
  totalProducts: number;
  setCurrentPage: (page: number) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  minPrice: number | null;
  setMinPrice: (price: number | null) => void;
  maxPrice: number | null;
  setMaxPrice: (price: number | null) => void;
  stockStatus: string | null;
  setStockStatus: (status: string | null) => void;
  sortBy: string | null;
  setSortBy: (sort: string | null) => void;
  categories: { id: number; name: string }[];
}

export function FeaturedProducts({
  products,
  loading,
  currentUser,
  onOrderSuccess,
  currentPage,
  pageSize,
  totalProducts,
  setCurrentPage,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  stockStatus,
  setStockStatus,
  sortBy,
  setSortBy,
  categories,
}: FeaturedProductsProps) {
  const [selectedProduct, setSelectedProduct] = useState<ProductUI | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<DBProduct | null>(null);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();

  const categoryNames = ["All", ...categories.map(c => c.name)];

  const handleBuyClick = (p: ProductUI) => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    setSelectedProduct(p);
  };

  const handleQuickViewClick = (p: ProductUI) => {
    const dbItem = products.find(prod => prod.id === p.id);
    if (dbItem) {
      setQuickViewProduct(dbItem);
    }
  };

  // Map backend products directly to visual structure
  const uiProducts: ProductUI[] = products.map((p) => {
    const rating = (p.id % 5) * 0.1 + 4.5;
    const reviews = p.id * 17 + 23;
    const stock = p.stock_quantity - p.reserved_quantity - p.sold_quantity;
    
    let badge = undefined;
    let badgeColor = undefined;
    if (p.id % 4 === 0) {
      badge = "New Arrival";
      badgeColor = "bg-emerald-100 text-emerald-700";
    } else if (p.id % 3 === 0) {
      badge = "Sale";
      badgeColor = "bg-rose-100 text-rose-700";
    } else if (p.id % 5 === 0) {
      badge = "Best Seller";
      badgeColor = "bg-amber-100 text-amber-700";
    }
    
    let img = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop&q=80";
    if (p.images && p.images.length > 0) {
      img = p.images[0].url;
    }
    
    return {
      id: p.id,
      name: p.name,
      category: p.category?.name || "General",
      price: p.price,
      originalPrice: p.id % 3 === 0 ? Math.round(p.price * 1.25) : undefined,
      rating,
      reviews,
      stock,
      badge,
      badgeColor,
      img,
      description: p.description || "Premium quality item for everyday use."
    };
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(1);
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setCurrentPage(1);
  };

  return (
    <section id="products" className="py-24 px-5 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 text-xs text-sky-700 bg-sky-100/80 px-3.5 py-1.5 rounded-full border border-sky-200 font-bold uppercase tracking-widest mb-4 backdrop-blur-md">
            <Zap className="w-3.5 h-3.5 text-sky-600" />
            Featured Collection
          </span>
          <h2
            className="text-slate-900 mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.02em" }}
          >
            Trending right now
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto leading-relaxed">
            Explore authentic products fetched live from our platform, complete with fast delivery and premium security.
          </p>
        </motion.div>

        {/* Search, Filter & Toolbar Container */}
        <div className="flex flex-col items-center gap-6 mb-12">
          {/* Search bar + Filter Toggle */}
          <div className="w-full max-w-2xl flex flex-col sm:flex-row items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full">
              <input
                type="text"
                placeholder="Search products by name or description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-sky-200 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 bg-white"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 text-white text-sm font-semibold hover:from-sky-600 hover:to-cyan-700 shadow-md shadow-sky-500/20 transition-all cursor-pointer"
              >
                Search
              </button>
            </form>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                showFilters || minPrice !== null || maxPrice !== null || stockStatus !== null
                  ? "bg-sky-50 border-sky-300 text-sky-700"
                  : "bg-white border-sky-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Zap className="w-4 h-4 text-sky-600" />
              Filters {minPrice || maxPrice || stockStatus ? "(Active)" : ""}
            </button>
          </div>

          {/* Advanced Multi-Attribute Filter Toolbar Expandable */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-2xl bg-white border border-sky-200 rounded-2xl p-5 shadow-sm space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Min Price */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Min Price ($)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={minPrice ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        setMinPrice(val);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 text-xs border border-sky-100 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Max Price */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Max Price ($)</label>
                    <input
                      type="number"
                      placeholder="1000+"
                      value={maxPrice ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        setMaxPrice(val);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 text-xs border border-sky-100 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Sort By */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1 block">Sort By</label>
                    <select
                      value={sortBy ?? "latest"}
                      onChange={(e) => {
                        setSortBy(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 text-xs border border-sky-100 rounded-xl focus:outline-none focus:border-sky-500 bg-white font-medium text-slate-700"
                    >
                      <option value="latest">Newest Arrivals</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="sold_desc">Best Sellers</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-sky-100 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={stockStatus === "in_stock"}
                      onChange={(e) => {
                        setStockStatus(e.target.checked ? "in_stock" : null);
                        setCurrentPage(1);
                      }}
                      className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>In Stock Only</span>
                  </label>

                  <button
                    onClick={() => {
                      setMinPrice(null);
                      setMaxPrice(null);
                      setStockStatus(null);
                      setSortBy("latest");
                      setSearchQuery("");
                      setSearchInput("");
                      setCurrentPage(1);
                    }}
                    className="text-sky-600 hover:text-sky-800 font-bold transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Category filter */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {categoryNames.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 text-white shadow-md shadow-sky-500/25"
                    : "bg-white text-slate-600 border border-sky-200/80 hover:border-sky-300 hover:text-sky-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : uiProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-slate-900 font-semibold mb-2">No products found</h3>
            <p className="text-slate-500 text-sm mb-6">Try a different search or category.</p>
            <button
              onClick={() => { setSelectedCategory("All"); setSearchQuery(""); setSearchInput(""); setCurrentPage(1); }}
              className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-sm hover:bg-sky-700 transition-colors cursor-pointer"
            >
              View All Products
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {uiProducts.map((product, i) => (
                <ProductCard key={product.id} product={product} onBuy={handleBuyClick} onQuickView={handleQuickViewClick} index={i} />
              ))}
            </div>

            {/* Storefront Pagination Controls */}
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="px-5 py-2.5 rounded-xl bg-white border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground transition-all cursor-pointer"
              >
                Previous
              </button>
              <span className="text-sm font-medium text-slate-600">
                Page {currentPage} of {Math.max(1, Math.ceil(totalProducts / pageSize))}
              </span>
              <button
                disabled={currentPage * pageSize >= totalProducts}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="px-5 py-2.5 rounded-xl bg-white border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedProduct && (
          <PurchaseModal
            product={selectedProduct}
            currentUser={currentUser}
            onClose={() => setSelectedProduct(null)}
            onOrderSuccess={onOrderSuccess}
          />
        )}
        {quickViewProduct && (
          <QuickViewModal
            product={quickViewProduct}
            onClose={() => setQuickViewProduct(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
