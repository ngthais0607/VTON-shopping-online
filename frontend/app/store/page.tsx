"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from '@/hooks/use-session';
import { apiGet } from "@/lib/api";
import { User } from "@/lib/types";
import { useProducts } from "@/hooks/use-products";
import { useCategoryOptions } from "@/hooks/use-categories";

import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { FeaturedProducts } from "./components/FeaturedProducts";
import { FeaturesSection } from "./components/FeaturesSection";
import { TrustSection } from "./components/TrustSection";
import { CTASection } from "./components/CTASection";
import { Footer } from "./components/Footer";

export default function StorefrontPage() {
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
    const pageSize = 8; // Display 8 products per page in Storefront

    function scrollToProducts() {
        productsRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    const { categories } = useCategoryOptions();
    const { products, total: totalProducts, isLoading: loading, mutate: mutateProducts } = useProducts({
        page: currentPage,
        pageSize,
        search: searchQuery,
        category_id: selectedCategoryId,
        min_price: minPrice,
        max_price: maxPrice,
        stock_status: stockStatus,
        sort_by: sortBy,
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
                    <FeaturedProducts 
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
                        setSearchQuery={setSearchQuery}
                        minPrice={minPrice}
                        setMinPrice={setMinPrice}
                        maxPrice={maxPrice}
                        setMaxPrice={setMaxPrice}
                        stockStatus={stockStatus}
                        setStockStatus={setStockStatus}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                        categories={categories}
                    />
                </div>
                
                <div id="features">
                    <FeaturesSection />
                </div>
                
                <div id="customer-love">
                    <TrustSection />
                </div>
                
                <CTASection onShopNow={scrollToProducts} />
            </main>
            
            <Footer />
        </div>
    );
}
