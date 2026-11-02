"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Eye, Heart, Search, SlidersHorizontal } from "lucide-react";
import { Product as DBProduct } from "@/lib/types";
import { getAvailableStock } from "@/lib/inventory";
import { CategoryNavigation } from '@/components/store/category-navigation';
import { CategoryOption, categoryGroups, categoryLabel } from '@/lib/catalog-presentation';
import { FashionFilters } from "@/components/store/fashion-filters";
import { formatCurrency } from "@/lib/utils";
import { getProductImageUrl } from "@/lib/placeholder-images";
import { QuickViewModal } from "./QuickViewModal";

interface FeaturedProductsProps {
  listing?: boolean;
  onResetFilters?: () => void;
  products: DBProduct[]; loading: boolean;
  currentPage: number; pageSize: number; totalProducts: number; setCurrentPage: (page: number) => void;
  selectedCategory: string; setSelectedCategory: (cat: string) => void;
  searchQuery: string; setSearchQuery: (query: string) => void;
  minPrice: number | null; setMinPrice: (price: number | null) => void;
  maxPrice: number | null; setMaxPrice: (price: number | null) => void;
  stockStatus: string | null; setStockStatus: (status: string | null) => void;
  sortBy: string | null; setSortBy: (sort: string | null) => void;
  categories: CategoryOption[];
}

function ProductCard({ product, onBuy, onQuickView }: { product: DBProduct; onBuy: () => void; onQuickView: () => void }) {
  const [liked, setLiked] = useState(false);
  useEffect(() => {
    try { setLiked(JSON.parse(localStorage.getItem("truelook-wishlist") || "[]").includes(product.id)); } catch { /* Storage is optional. */ }
  }, [product.id]);
  const toggleWishlist = () => {
    try {
      const saved: number[] = JSON.parse(localStorage.getItem("truelook-wishlist") || "[]");
      const next = saved.includes(product.id) ? saved.filter(id => id !== product.id) : [...saved, product.id];
      localStorage.setItem("truelook-wishlist", JSON.stringify(next));
      const metadata: { id: number; slug?: string; name: string; price: number; currency: string }[] = JSON.parse(localStorage.getItem("truelook_wishlist") || "[]");
      const remaining = metadata.filter(item => item.id !== product.id);
      if (next.includes(product.id)) remaining.push({ id: product.id, slug: product.slug, name: product.name, price: product.price, currency: product.currency });
      localStorage.setItem("truelook_wishlist", JSON.stringify(remaining)); setLiked(next.includes(product.id));
    } catch { setLiked(value => !value); }
  };
  const secondaryImage = product.images?.find(image => image.url !== getProductImageUrl(product));
  const stock = getAvailableStock(product);
  const pdpUrl = "/store/products/" + (product.slug || product.id);
  const colors = Array.from(new Map((product.variants || []).filter(v => v.color_name).map(v => [v.color_name, { name: v.color_name, hex: v.color_hex }])).values());
  return <article className="group min-w-0">
    <div className="relative aspect-[4/5] overflow-hidden bg-[#eeede6]">
      <Link href={pdpUrl} className="block h-full w-full"><Image src={getProductImageUrl(product)} alt={product.name} fill sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 23vw" className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.035]" />{secondaryImage && <Image src={secondaryImage.url} alt={product.name + " · alternate view"} fill sizes="(max-width: 640px) 46vw, 25vw" className="object-cover opacity-0 transition-opacity duration-500 motion-safe:group-hover:opacity-100" />}</Link>
      {stock <= 0 && <span className="absolute left-3 top-3 bg-background/95 px-2.5 py-1.5 text-[10px] uppercase tracking-wider">Sold out</span>}
      <div className="absolute right-2 top-2 flex gap-1">
        <button onClick={onQuickView} aria-label={"Quick view " + product.name} title="Quick View" className="flex h-10 w-10 items-center justify-center bg-background/90 hover:bg-white"><Eye className="h-4 w-4" /></button>
        <button onClick={toggleWishlist} aria-label={"Wishlist " + product.name} aria-pressed={liked} className="flex h-10 w-10 items-center justify-center bg-background/90 hover:bg-white"><Heart className={liked ? "h-4 w-4 fill-primary text-primary" : "h-4 w-4"} /></button>
      </div>
      <button onClick={onBuy} disabled={stock <= 0} aria-label={stock <= 0 ? "Sold Out" : "Quick Buy"} className="absolute inset-x-3 bottom-3 flex min-h-11 items-center justify-between gap-2 border border-border bg-background/95 px-3 text-xs font-medium transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:inset-x-4 sm:bottom-4 sm:px-4">
        {stock <= 0 ? "Sold out" : "Choose options"}<ArrowUpRight className="h-4 w-4" />
      </button>
    </div>
    <div className="pb-2 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><span>{categoryLabel(product.category?.name || "TrueLook")}</span>{stock > 0 && stock < 10 && <span className="normal-case tracking-normal">{stock} available</span>}</div>
      <Link href={pdpUrl} className="block text-base font-normal leading-6 hover:text-primary sm:text-lg" style={{ fontFamily: "var(--font-display)" }}><h3>{product.name}</h3></Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide">{product.price_min && product.price_max && product.price_min < product.price_max ? "From " + formatCurrency(product.price_min, product.currency) : formatCurrency(product.price, product.currency)}</p>
        {colors.length > 0 && <div className="flex items-center gap-1.5" aria-label="Available colors">{colors.slice(0, 4).map(color => <span key={color.name} title={color.name} className="h-3 w-3 rounded-full border border-black/15" style={{ backgroundColor: color.hex || "#8b9380" }} />)}{colors.length > 4 && <span className="text-[10px] text-muted-foreground">+{colors.length - 4}</span>}</div>}
      </div>
      {product.rating_avg != null && (product.review_count ?? 0) > 0 && <p className="mt-2 text-xs text-muted-foreground">★ {product.rating_avg} · {product.review_count} reviews</p>}
    </div>
  </article>;
}

export function FeaturedProducts({ listing = false, onResetFilters, products, loading, currentPage, pageSize, totalProducts, setCurrentPage, selectedCategory, setSelectedCategory, searchQuery, setSearchQuery, minPrice, setMinPrice, maxPrice, setMaxPrice, stockStatus, setStockStatus, sortBy, setSortBy, categories }: FeaturedProductsProps) {
  const [quickViewProduct, setQuickViewProduct] = useState<DBProduct | null>(null);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { setSearchInput(searchQuery); }, [searchQuery]);
  const router = useRouter();
  const totalPages = Math.ceil(totalProducts / pageSize);
  const control = "min-h-11 w-full border border-border bg-background px-3 text-sm";
  return <section id="products" className="scroll-mt-44 bg-background px-6 py-8 md:py-12 lg:px-20">
    <div className="mx-auto max-w-[1280px]">
      {listing && <nav aria-label="Breadcrumb" className="mb-5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><Link href="/store">Home</Link><span className="px-3">/</span><span className="text-foreground">Collection</span></nav>}
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-primary">{listing ? "THE COLLECTION" : "THE CONSIDERED EDIT"}</p><h2 className="text-4xl font-normal tracking-[-0.025em] md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>{listing ? "Collection" : "Selected for you"}</h2></div>
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">Thoughtful pieces for everyday.<br />Find your own perspective.</p>
      </div>
      <div className="flex flex-col gap-5 border-y border-border py-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className={listing ? "hidden" : "flex min-w-0 flex-1 items-center gap-5 overflow-x-auto whitespace-nowrap"} aria-label="Product categories"><button onClick={() => setSelectedCategory('All')} aria-pressed={selectedCategory === 'All'} className="min-h-11 text-xs">All</button>{categoryGroups(categories).slice(0, 5).map(category => <button key={category.id} onClick={() => setSelectedCategory(category.name)} aria-pressed={selectedCategory === category.name} className="min-h-11 text-xs text-muted-foreground aria-pressed:text-foreground aria-pressed:underline">{categoryLabel(category.name)}</button>)}<Link href="/store/collection" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">View collection</Link></div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="catalog-filters" aria-label="Filters" className={"inline-flex min-h-11 items-center gap-2 border border-border px-4 text-sm hover:bg-secondary " + (listing ? "lg:hidden" : "")}><SlidersHorizontal className="h-4 w-4" />Filters{(minPrice !== null || maxPrice !== null || stockStatus) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</button>
            <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground"><span className="sr-only">Sort By</span><select aria-label="Sort By" value={sortBy || "latest"} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }} className="min-h-11 max-w-full border-0 bg-transparent pr-5 text-sm text-foreground"><option value="latest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="sold_desc">Best selling</option></select></label>
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); setSearchQuery(searchInput); setCurrentPage(1); }} className="flex w-full gap-2 lg:max-w-md">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input type="search" aria-label="Search products" placeholder="Search products…" value={searchInput} onChange={e => setSearchInput(e.target.value)} className={control + " pl-10"} /></div><button type="submit" aria-label="Search" className="min-h-11 bg-foreground px-4 text-sm text-background hover:bg-primary">Search</button>
        </form>
      </div>
      <div className={listing ? "mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12" : ""}>
      {(showFilters || listing) && <aside id="catalog-filters" className={listing ? ((showFilters ? "block" : "hidden") + " border-b border-border pb-6 lg:sticky lg:top-44 lg:block lg:max-h-[calc(100dvh-12rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:pr-3") : "border-b border-border py-6"}>
        {listing && <CategoryNavigation categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />}
        <FashionFilters hideStock />
        <details className="border-b border-border"><summary className="min-h-12 cursor-pointer py-4 text-xs">Price & availability</summary><div className={"mb-4 grid items-end gap-4 border-t border-border pt-6 " + (listing ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
          {listing && <label className="space-y-3 text-xs"><span>Maximum price</span><input aria-label="Maximum price" type="range" min="0" max={Math.max(10000000, ...products.map(product => product.price))} step="100000" value={maxPrice ?? 10000000} onChange={event => { setMaxPrice(Number(event.target.value)); setCurrentPage(1); }} className="w-full accent-[#1C1C1C]" /></label>}
          <label className="space-y-2 text-xs text-muted-foreground"><span>Minimum price</span><input type="number" min="0" placeholder="0" value={minPrice ?? ""} onChange={e => { setMinPrice(e.target.value ? Number(e.target.value) : null); setCurrentPage(1); }} className={control} /></label>
          <label className="space-y-2 text-xs text-muted-foreground"><span>Maximum price</span><input type="number" min="0" placeholder="No maximum" value={maxPrice ?? ""} onChange={e => { setMaxPrice(e.target.value ? Number(e.target.value) : null); setCurrentPage(1); }} className={control} /></label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={stockStatus === "in_stock"} onChange={e => { setStockStatus(e.target.checked ? "in_stock" : null); setCurrentPage(1); }} className="h-4 w-4 accent-primary" /><Check className="sr-only" />In stock only</label>
          <button onClick={() => { if (onResetFilters) { onResetFilters(); return; } setMinPrice(null); setMaxPrice(null); setStockStatus(null); setSortBy("latest"); setSearchQuery(""); setSearchInput(""); setCurrentPage(1); }} className="min-h-11 text-left text-xs text-primary underline underline-offset-4">Clear filters</button>
        </div></details>
      </aside>}
      <div className="min-w-0">
      <div className={"flex items-center justify-between gap-4 text-xs text-muted-foreground " + (listing ? "pb-5" : "py-6")} aria-live="polite"><span>{loading ? "Loading products…" : totalProducts + " products"}</span><span className="text-[9px] tracking-[0.18em]">TRUELOOK / THE COLLECTION</span></div>
      {loading ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4" aria-label="Loading products">{Array.from({ length: 8 }, (_, i) => <div key={i} className="motion-safe:animate-pulse"><div className="aspect-[4/5] bg-secondary" /><div className="mt-4 h-3 w-1/3 bg-secondary" /><div className="mt-3 h-4 w-4/5 bg-secondary" /></div>)}</div> : products.length === 0 ? <div className="border border-dashed border-border px-5 py-20 text-center"><h3 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>No matching products.</h3><p className="mt-3 text-sm text-muted-foreground">Try another search or clear your filters.</p><button onClick={() => { if (onResetFilters) { onResetFilters(); return; } setSelectedCategory("All"); setSearchQuery(""); setSearchInput(""); setCurrentPage(1); }} className="mt-5 min-h-11 border-b border-primary text-sm text-primary">View all products</button></div> : <div className={"grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 " + (listing ? "xl:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4")}>{products.map(product => <ProductCard key={product.id} product={product} onBuy={() => router.push("/store/products/" + (product.slug || product.id))} onQuickView={() => setQuickViewProduct(product)} />)}</div>}
      {!loading && totalPages > 1 && <nav aria-label="Product pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2"><button aria-label="Previous" disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)} className="flex min-h-11 items-center gap-2 px-3 text-sm disabled:opacity-30"><ArrowLeft className="h-4 w-4" />Previous</button>{Array.from({ length: totalPages }, (_, i) => i + 1).filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) < 2).map((page, index, pages) => <span key={page} className="flex items-center">{index > 0 && page - pages[index - 1] > 1 && <span className="px-2">…</span>}<button aria-current={page === currentPage ? "page" : undefined} onClick={() => setCurrentPage(page)} className={page === currentPage ? "h-11 min-w-11 bg-primary px-3 text-sm text-primary-foreground" : "h-11 min-w-11 border border-border px-3 text-sm hover:bg-secondary"}>{page}</button></span>)}<button aria-label="Next" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)} className="flex min-h-11 items-center gap-2 px-3 text-sm disabled:opacity-30">Next<ArrowRight className="h-4 w-4" /></button></nav>}
      </div>
      </div>
    </div>
    {quickViewProduct && <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />}
  </section>;
}
