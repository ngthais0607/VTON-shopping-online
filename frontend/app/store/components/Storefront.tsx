"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { updateCatalogQuery } from "@/lib/catalog-presentation";
import { useProducts } from "@/hooks/use-products";
import { useCategoryOptions } from "@/hooks/use-categories";

import { Header } from "./Header";
import { HeroSection } from "./HeroSection";
import { FeaturedProducts } from "./FeaturedProducts";
import { Footer } from "./Footer";
import { CategoryStories, EditorialStory, BrandValues, Newsletter, ProductRail } from "./LuxurySections";

function StorefrontContent({ listing = false }: { listing?: boolean }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const query = searchParams?.toString() || "";
    const pendingQuery = useRef(query);
    useEffect(() => { pendingQuery.current = query; }, [query]);
    const [pagination, setPagination] = useState({query, page: 1});
    const currentPage = pagination.query === query ? pagination.page : 1;
    const setCurrentPage = (page: number) => setPagination({query, page});
    const updateQuery = (updates: Record<string, string | null>) => {
        const next = updateCatalogQuery(pendingQuery.current, updates);
        pendingQuery.current = next.slice(1);
        router.replace(next, {scroll: false});
    };
    const { products: bestSellers } = useProducts({ page: 1, pageSize: 8, sort_by: "sold_desc", is_active: true });

    const pageSize = listing ? 12 : 4;

    const { categories, error: categoriesError, isLoading: categoriesLoading, mutate: retryCategories } = useCategoryOptions();

    // Read URL facets/filters safely with optional chaining
    const urlCategory = searchParams?.get?.("category_id");
    const urlGender = searchParams?.get?.("gender");
    const urlBrand = searchParams?.get?.("brand");
    const urlSize = searchParams?.get?.("size");
    const urlColor = searchParams?.get?.("color");
    const urlStock = searchParams?.get?.("stock_status");
    const urlMinPrice = searchParams?.get?.("min_price");
    const urlMaxPrice = searchParams?.get?.("max_price");
    const urlSort = searchParams?.get?.("sort") || searchParams?.get?.("sort_by");
    const urlSearch = searchParams?.get?.("search");

    const numeric = (value: string | null | undefined) => value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const effectiveCategoryId = numeric(urlCategory);
    const effectiveMinPrice = numeric(urlMinPrice);
    const effectiveMaxPrice = numeric(urlMaxPrice);
    const effectiveStockStatus = urlStock;
    const effectiveSortBy = urlSort || "latest";
    const effectiveSearch = urlSearch || "";
    const selectedCategory = categories.find(category => category.id === effectiveCategoryId)?.name || "All";

    const { products, total: totalProducts, isLoading: loading, error: productsError, mutate: mutateProducts } = useProducts({
        page: currentPage,
        pageSize,
        search: effectiveSearch,
        category_id: effectiveCategoryId,
        min_price: effectiveMinPrice,
        max_price: effectiveMaxPrice,
        stock_status: effectiveStockStatus,
        sort_by: effectiveSortBy,
        gender: urlGender,
        brand: urlBrand,
        size: urlSize,
        color: urlColor,
        is_active: true,
    });

    const handleCategoryChange = (name: string) => updateQuery({category_id: name === "All" ? null : String(categories.find(category => category.name === name)?.id || '')});

    return (
        <div className="min-h-screen bg-background text-foreground antialiased font-sans flex flex-col">
            <Header />

            <main className={listing ? "flex-1 pt-16 lg:pt-[106px]" : "flex-1"}>
                {!listing && <><HeroSection /><CategoryStories /></>}

                <div className="scroll-mt-24">
                    {productsError && <div role="alert" className="mx-auto my-8 max-w-3xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive"><p>{productsError.message}</p><button className="mt-3 min-h-11 border border-current px-4" onClick={()=>mutateProducts()}>Retry</button></div>}
                    {categoriesError && <div role="alert" className="mx-auto my-8 max-w-3xl border border-border bg-secondary p-6 text-sm"><p>{categoriesError.message}</p><button className="mt-3 min-h-11 border border-border px-4" onClick={()=>retryCategories()}>Retry categories</button></div>}
                    {categoriesLoading && <p role="status" className="mx-auto max-w-[1312px] px-5 pt-6 text-sm text-muted-foreground">Loading categories...</p>}
                    {!productsError && <FeaturedProducts
                        listing={listing}
                        products={products}
                        loading={loading}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        totalProducts={totalProducts}
                        setCurrentPage={setCurrentPage}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={handleCategoryChange}
                        searchQuery={effectiveSearch}
                        setSearchQuery={(value) => updateQuery({search: value || null})}
                        minPrice={effectiveMinPrice}
                        setMinPrice={(value) => updateQuery({min_price: value === null ? null : String(value)})}
                        maxPrice={effectiveMaxPrice}
                        setMaxPrice={(value) => updateQuery({max_price: value === null ? null : String(value)})}
                        stockStatus={effectiveStockStatus}
                        setStockStatus={(value) => updateQuery({stock_status: value})}
                        sortBy={effectiveSortBy}
                        setSortBy={(value) => updateQuery({sort: value})}
                        onResetFilters={() => updateQuery(Object.fromEntries(['category_id','gender','brand','size','color','stock_status','min_price','max_price','search','sort'].map(key => [key, null])))}
                        categories={categories}
                    />}
                </div>

                {!listing && <><EditorialStory /><ProductRail products={bestSellers} /><BrandValues /><Newsletter /></>}
            </main>

            <Footer />
        </div>
    );
}

export default function StorefrontPage({ listing = false }: { listing?: boolean }) {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading TrueLook...</div>}>
            <StorefrontContent listing={listing} />
        </Suspense>
    );
}
