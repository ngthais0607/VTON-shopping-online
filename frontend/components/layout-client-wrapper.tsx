// Path: frontend/components/layout-client-wrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { apiGet } from "@/lib/api";
import { User } from "@/lib/types";

export function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem("token");

            // 1. Các trang công cộng (không cần token, không hiện Sidebar)
            const isStorePage = pathname.startsWith("/store");
            const isPublicPage = pathname === "/" || pathname === "/login" || pathname === "/register" || isStorePage;

            // 2. Các trang chỉ dành cho khách chưa đăng nhập (nếu đăng nhập rồi sẽ bị redirect)
            const isAuthPage = pathname === "/login" || pathname === "/register";

            if (!token) {
                if (!isPublicPage) {
                    router.push("/login");
                } else {
                    setChecking(false);
                }
            } else {
                try {
                    // Fetch user info to verify role
                    const user = await apiGet<User>("/users/me");

                    if (isAuthPage) {
                        if (user.role === "admin") {
                            router.push("/dashboard");
                        } else {
                            router.push("/store");
                        }
                    } else if (!isPublicPage && user.role !== "admin") {
                        // Nếu là Customer cố tình vào trang Admin -> đẩy về Storefront
                        router.push("/store");
                    } else {
                        setChecking(false);
                    }
                } catch (err) {
                    console.error("Token verification failed", err);
                    localStorage.removeItem("token");
                    if (!isPublicPage) {
                        router.push("/login");
                    } else {
                        setChecking(false);
                    }
                }
            }
        };

        checkAuth();
    }, [pathname, router]);


    if (checking) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
                    <p className="text-sm font-medium text-slate-600">Verifying access...</p>
                </div>
            </div>
        );
    }

    // Ẩn Sidebar trên các trang công cộng
    const isStorePage = pathname.startsWith("/store");
    const isPublicPage = pathname === "/" || pathname === "/login" || pathname === "/register" || isStorePage;

    if (isPublicPage) {
        return <div className="w-full min-h-screen bg-slate-50">{children}</div>;
    }

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />
            <div className="flex-1 overflow-x-hidden">{children}</div>
        </div>
    );
}
