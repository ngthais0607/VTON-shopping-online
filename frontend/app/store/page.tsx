"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from '@/hooks/use-session';
import { apiGet } from "@/lib/api";
import { User } from "@/lib/types";
import { useProducts } from "@/hooks/use-products";
import { useCategoryOptions } from "@/hooks/use-categories";

import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { FeaturedProducts } from "./components/FeaturedProducts";
import { Footer } from "./components/Footer";

function StorefrontContent() {
    const searchParams = useSearchParams();
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedCategory, setSelectedCategory] = useState<string>("All");
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [minPrice, setMinPrice] = useState<number | null>(null);
    const [maxPrice, setMaxPrice] = useState<number | null>(null);
    const [stockStatus, setStockStatus] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string | null>("latest");
    const {user: currentUser} = useSession();
    
    const productsRef = useRef<HTMLDivElement>(null);
    const pageSize = 8; // Display 8 products per page on Homepage

    function scrollToProducts() {
        productsRef.current?.scrollIntoView({ behavior: "smooth" });
    }

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

    const effectiveCategoryId = urlCategory ? parseInt(urlCategory) : selectedCategoryId;
    const effectiveMinPrice = urlMinPrice ? parseFloat(urlMinPrice) : minPrice;
    const effectiveMaxPrice = urlMaxPrice ? parseFloat(urlMaxPrice) : maxPrice;
    const effectiveStockStatus = urlStock || stockStatus;
    const effectiveSortBy = urlSort || sortBy;
    const effectiveSearch = urlSearch || searchQuery;

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

    const handleCategoryChange = useCallback((catName: string) => {
        setSelectedCategory(catName);
        if (catName === "All") {
            setSelectedCategoryId(null);
        } else {
            const matched = categories.find(c => c.name === catName);
            if (matched) {
                setSelectedCategoryId(matched.id);
            }
        }
        setCurrentPage(1);
    }, [categories]);

    return (
        <div className="min-h-screen bg-background text-foreground antialiased font-sans flex flex-col">
            <Header currentUser={currentUser} onShopNow={scrollToProducts} />
            
            <main className="flex-1">
                <HeroSection onShopNow={scrollToProducts} />
                
                <div ref={productsRef}>
                    {productsError && <p role="alert">{productsError.message}<button onClick={()=>mutateProducts()}>Retry</button></p>}
                    {categoriesError && <p role="alert">{categoriesError.message}<button onClick={()=>retryCategories()}>Retry categories</button></p>}
                    {categoriesLoading && <p>Loading categories...</p>}
                    {!productsError && <FeaturedProducts
                        products={products} 
                        loading={loading} 
                        currentUser={currentUser} 
                        onOrderSuccess={mutateProducts}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        totalProducts={totalProducts}
                        setCurrentPage={setCurrentPage}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={handleCategoryChange}
                        searchQuery={searchQuery}
                        setSearchQuery={(value) => {setSearchQuery(value); setCurrentPage(1);}}
                        minPrice={minPrice}
                        setMinPrice={(value) => {setMinPrice(value); setCurrentPage(1);}}
                        maxPrice={maxPrice}
                        setMaxPrice={(value) => {setMaxPrice(value); setCurrentPage(1);}}
                        stockStatus={stockStatus}
                        setStockStatus={(value) => {setStockStatus(value); setCurrentPage(1);}}
                        sortBy={sortBy}
                        setSortBy={(value) => {setSortBy(value); setCurrentPage(1);}}
                        categories={categories}
                    />}
                </div>
                
            </main>
            
            <Footer />
        </div>
    );
}

export default function StorefrontPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading TrueLook...</div>}>
            <StorefrontContent />
        </Suspense>
    );
}
