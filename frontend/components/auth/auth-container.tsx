// Path: frontend/components/auth/auth-container.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, registerSchema, LoginFormData, RegisterFormData } from "@/lib/validations/auth";
import { apiPost, apiGet } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, User, Lock, Eye, EyeOff, AlertCircle, Sparkles, Star, ShieldCheck, Truck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from "sonner";
import Image from "next/image";

interface AuthContainerProps {
    defaultTab: "signin" | "signup";
}

const promoProducts = [
    {
        id: 1,
        name: "Arc Pro Watch",
        category: "Wearables",
        originalPrice: "$349",
        memberPrice: "$299",
        rating: 4.9,
        img: "https://images.unsplash.com/photo-1631863552122-3072cf599a46?w=200&h=200&fit=crop&auto=format",
        badge: "Hot",
        badgeColor: "bg-rose-50 border-rose-100 text-rose-600",
        rotation: "rotate-[-2deg] hover:rotate-0 hover:-translate-y-0.5",
    },
    {
        id: 2,
        name: "Studio Headphones",
        category: "Audio",
        originalPrice: "$189",
        memberPrice: "$159",
        rating: 4.8,
        img: "https://images.unsplash.com/photo-1755719401551-9e2b4be00555?w=200&h=200&fit=crop&auto=format",
        badge: "Popular",
        badgeColor: "bg-indigo-50 border-indigo-100 text-indigo-600",
        rotation: "rotate-[1deg] hover:rotate-0 hover:-translate-y-0.5",
    },
    {
        id: 3,
        name: "Noir Perfume",
        category: "Fragrance",
        originalPrice: "$124",
        memberPrice: "$99",
        rating: 4.7,
        img: "https://images.unsplash.com/photo-1768025719875-48ed072f3084?w=200&h=200&fit=crop&auto=format",
        badge: "Sale",
        badgeColor: "bg-amber-50 border-amber-100 text-amber-600",
        rotation: "rotate-[-1deg] hover:rotate-0 hover:-translate-y-0.5",
    },
];

export function AuthContainer({ defaultTab }: AuthContainerProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"signin" | "signup">(defaultTab);
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Sync state when prop changes (e.g. navigation between /login and /register)
    useEffect(() => {
        setActiveTab(defaultTab);
        setError("");
    }, [defaultTab]);

    const handleTabChange = (tab: "signin" | "signup") => {
        setActiveTab(tab);
        setError("");
        if (tab === "signin") {
            router.push("/login");
        } else {
            router.push("/register");
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (activeTab === "signup") {
            if (!formData.fullName.trim()) {
                setError("Full name is required.");
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setError("Passwords do not match.");
                return;
            }
        }

        setLoading(true);

        try {
            if (activeTab === "signin") {
                // Login action
                const response = await apiPost<{ access_token: string; token_type: string }, any>("/users/login", {
                    email: formData.email,
                    password: formData.password,
                });

                localStorage.setItem("token", response.access_token);

                try {
                    const me = await apiGet<{ role?: string }>("/users/me");
                    if (me && me.role === "admin") {
                        toast.success("Welcome Admin!", {
                            description: "Redirecting to admin dashboard...",
                        });
                        setTimeout(() => {
                            router.push("/dashboard");
                            router.refresh();
                        }, 800);
                        return;
                    }
                } catch (err) {
                    console.error("Failed to check user role", err);
                }

                toast.success("Welcome to LuxeStore!", {
                    description: "Redirecting to storefront...",
                });
                
                // Wait briefly for the toast to be seen before redirecting
                setTimeout(() => {
                    router.push("/store");
                    router.refresh();
                }, 800);
            } else {
                // Register action
                const parts = formData.fullName.trim().split(/\s+/);
                const firstName = parts[0] || "";
                const lastName = parts.slice(1).join(" ") || "";
                // Generate a username from email prefix
                const username = formData.email.split("@")[0] || formData.fullName.toLowerCase().replace(/[^a-z0-9]/g, "");

                await apiPost("/users/register", {
                    username,
                    email: formData.email,
                    password: formData.password,
                    first_name: firstName || null,
                    last_name: lastName || null,
                });

                toast.success("Account created successfully!", {
                    description: "Switching to login form...",
                });
                
                // Switch to Sign In tab and preset values
                setTimeout(() => {
                    setActiveTab("signin");
                    router.push("/login");
                    setFormData((prev) => ({
                        ...prev,
                        password: "",
                        confirmPassword: "",
                    }));
                }, 1200);
            }
        } catch (err: any) {
            setError(err.message || "An error occurred. Please try again.");
            toast.error(err.message || "Operation failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleSocialClick = (platform: string) => {
        toast.info(`${platform} login is not configured for this demo storefront.`, {
            description: "Please register/sign in using your email address instead.",
        });
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-4">
            <Toaster position="top-right" richColors closeButton />
            
            {/* Outer border wrapper for high-fidelity gradient border matching storefront page */}
            <div className="p-[1px] bg-gradient-to-br from-indigo-500/20 via-violet-300/30 to-indigo-500/20 rounded-[32px] shadow-[0_32px_80px_rgba(99,102,241,0.06)]">
                <div className="bg-white/95 backdrop-blur-2xl rounded-[31px] overflow-hidden w-full grid md:grid-cols-12 relative min-h-[660px]">
                    
                    {/* Left Side: Brand Promo Panel (visible on desktop) - Grid columns: 5 */}
                    <div className="hidden md:flex md:col-span-5 flex-col justify-between p-10 bg-gradient-to-br from-indigo-50/20 via-slate-50/40 to-indigo-50/25 text-slate-800 relative overflow-hidden select-none border-r border-slate-100">
                        
                        {/* Soft Ambient Glows aligned with storefront theme */}
                        <div className="absolute top-[-20%] left-[-20%] w-[120%] h-[120%] bg-indigo-200/20 rounded-full blur-[80px] pointer-events-none animate-pulse duration-[8s]" />
                        <div className="absolute bottom-[-10%] right-[-10%] w-[90%] h-[90%] bg-violet-200/15 rounded-full blur-[90px] pointer-events-none" />

                        {/* Top Info */}
                        <div className="space-y-4 relative z-10">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold tracking-wide text-indigo-700">
                                <Sparkles className="h-3 w-3 text-indigo-600" />
                                LuxeStore VIP Club
                            </span>
                            
                            <h2 className="text-2xl font-extrabold tracking-tight leading-snug text-slate-900">
                                Join & Save on Top Brands
                            </h2>
                            
                            <p className="text-slate-500 text-xs leading-relaxed">
                                Get instant access to exclusive member-only pricing on wearables, audio, and more.
                            </p>
                        </div>

                        {/* Middle: Interactive Overlapping Store Products Showcase */}
                        <div className="relative py-4 z-10 flex flex-col gap-3 items-center justify-center">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                                Featured Member Discounts
                            </p>
                            
                            <div className="w-full max-w-[285px] space-y-3">
                                {promoProducts.map((product) => (
                                    <div 
                                        key={product.id}
                                        className={`bg-white border border-slate-150 p-2.5 rounded-2xl flex items-center gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_36px_rgba(99,102,241,0.05)] transition-all duration-300 transform ${product.rotation}`}
                                    >
                                        <div className="relative w-11 h-11 shrink-0 border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
                                            <Image 
                                                src={product.img} 
                                                alt={product.name} 
                                                fill
                                                sizes="44px"
                                                className="object-cover"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="text-[9px] text-slate-400 font-semibold truncate">{product.category}</span>
                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${product.badgeColor}`}>{product.badge}</span>
                                            </div>
                                            <h4 className="font-bold text-[11px] text-slate-800 truncate mt-0.5">{product.name}</h4>
                                            
                                            {/* Star Rating */}
                                            <div className="flex items-center gap-0.5 text-[8px] text-amber-500 mt-1">
                                                <Star className="h-2.5 w-2.5 fill-current" />
                                                <span className="font-semibold">{product.rating}</span>
                                            </div>
                                        </div>
                                        
                                        {/* Price display */}
                                        <div className="text-right shrink-0 pl-1">
                                            <span className="text-[9px] text-slate-400 line-through font-medium block">{product.originalPrice}</span>
                                            <span className="text-xs text-indigo-600 font-extrabold block">{product.memberPrice}</span>
                                        </div>
                                    </div>
                                ))}

                                {/* Welcome voucher ticket to fill space nicely */}
                                <div className="mt-4 p-3 rounded-2xl bg-indigo-50/50 border border-dashed border-indigo-200/50 flex items-center justify-between relative overflow-hidden shadow-sm">
                                    {/* Circular cutouts on sides to look like a ticket */}
                                    <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-slate-50 rounded-full border-r border-slate-200/60" />
                                    <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-slate-50 rounded-full border-l border-slate-200/60" />
                                    
                                    <div className="pl-1">
                                        <span className="text-[8px] uppercase tracking-wider text-indigo-500 font-bold">Signup Offer</span>
                                        <h4 className="font-extrabold text-[11px] text-slate-800 mt-0.5">$20 Voucher</h4>
                                    </div>
                                    <div className="pr-1 text-right">
                                        <span className="text-[9px] font-mono font-black text-indigo-600 bg-white border border-indigo-100 px-1.5 py-0.5 rounded-lg shadow-sm">
                                            WELCOME20
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom features list */}
                        <div className="space-y-2 pt-4 border-t border-slate-200/60 relative z-10">
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-600 font-semibold">
                                <Truck className="h-4 w-4 text-indigo-500 shrink-0" />
                                <span>Free Express Shipping &gt; $50</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-600 font-semibold">
                                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                                <span>100% Encrypted Authentication</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Auth Forms - Grid columns: 7 */}
                    <div className="p-10 sm:p-12 md:col-span-7 flex flex-col justify-center bg-white relative">
                        
                        {/* Title and description placed dynamically inside the form container */}
                        <div className="mb-6">
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                {activeTab === "signin" ? "Welcome back" : "Create your account"}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-medium">
                                {activeTab === "signin" 
                                    ? "Sign in to LuxeStore to continue shopping." 
                                    : "Join LuxeStore — free forever, cancel anytime."}
                            </p>
                        </div>

                        {/* Segmented Tabs Switcher */}
                        <div className="bg-slate-100/80 p-1.5 rounded-2xl flex relative w-full mb-8">
                            <button
                                type="button"
                                onClick={() => handleTabChange("signin")}
                                className="relative z-10 w-1/2 text-center py-2.5 text-sm font-bold rounded-xl transition-colors duration-200 cursor-pointer"
                                style={{ color: activeTab === "signin" ? "#1e293b" : "#64748b" }}
                            >
                                {activeTab === "signin" && (
                                    <motion.div
                                        layoutId="active-tab-pill"
                                        className="absolute inset-0 bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200/20"
                                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                                    />
                                )}
                                <span className="relative z-10">Sign in</span>
                            </button>
                            
                            <button
                                type="button"
                                onClick={() => handleTabChange("signup")}
                                className="relative z-10 w-1/2 text-center py-2.5 text-sm font-bold rounded-xl transition-colors duration-200 cursor-pointer"
                                style={{ color: activeTab === "signup" ? "#1e293b" : "#64748b" }}
                            >
                                {activeTab === "signup" && (
                                    <motion.div
                                        layoutId="active-tab-pill"
                                        className="absolute inset-0 bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200/20"
                                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                                    />
                                )}
                                <span className="relative z-10">Sign up</span>
                            </button>
                        </div>

                        {/* Social Login Row */}
                        <div className="flex gap-4 mb-6">
                            <button
                                type="button"
                                onClick={() => handleSocialClick("Google")}
                                className="flex items-center justify-center gap-2.5 py-3 px-4 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/10 rounded-2xl bg-white text-slate-700 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.98] w-1/2 cursor-pointer"
                            >
                                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                                </svg>
                                <span>Google</span>
                            </button>
                            
                            <button
                                type="button"
                                onClick={() => handleSocialClick("Apple")}
                                className="flex items-center justify-center gap-2.5 py-3 px-4 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/10 rounded-2xl bg-white text-slate-700 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.98] w-1/2 cursor-pointer"
                            >
                                <svg className="h-5 w-5 shrink-0 fill-current text-slate-900" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.51-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.58 2.96-1.41Z"/>
                                </svg>
                                <span>Apple</span>
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="relative flex items-center justify-center my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-100" />
                            </div>
                            <span className="relative px-3 bg-white text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                or with email
                            </span>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50/80 border border-rose-100 p-4 text-sm text-rose-600 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                    <span className="font-medium">{error}</span>
                                </div>
                            )}

                            <AnimatePresence mode="popLayout" initial={false}>
                                {activeTab === "signup" && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, y: -10 }}
                                        animate={{ opacity: 1, height: "auto", y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4 overflow-hidden"
                                    >
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors peer-focus:text-indigo-500" />
                                            <Input
                                                id="fullName"
                                                name="fullName"
                                                type="text"
                                                placeholder="Full name"
                                                value={formData.fullName}
                                                onChange={handleChange}
                                                className="pl-12 h-12 bg-slate-50/40 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 rounded-2xl transition-all duration-300 focus:bg-white focus:shadow-[0_0_16px_rgba(99,102,241,0.08)] peer"
                                                required={activeTab === "signup"}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors peer-focus:text-indigo-500" />
                                <Input
                                    id="email"
                                    name="email"
                                    type="text"
                                    placeholder="Email or Username"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="pl-12 h-12 bg-slate-50/40 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 rounded-2xl transition-all duration-300 focus:bg-white focus:shadow-[0_0_16px_rgba(99,102,241,0.08)] peer"
                                    required
                                />
                            </div>

                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors peer-focus:text-indigo-500" />
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="pl-12 pr-12 h-12 bg-slate-50/40 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 rounded-2xl transition-all duration-300 focus:bg-white focus:shadow-[0_0_16px_rgba(99,102,241,0.08)] peer"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>

                            <AnimatePresence mode="popLayout" initial={false}>
                                {activeTab === "signup" && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, y: -10 }}
                                        animate={{ opacity: 1, height: "auto", y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4 overflow-hidden"
                                    >
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 transition-colors peer-focus:text-indigo-500" />
                                            <Input
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                type={showConfirmPassword ? "text" : "password"}
                                                placeholder="Confirm password"
                                                value={formData.confirmPassword}
                                                onChange={handleChange}
                                                className="pl-12 pr-12 h-12 bg-slate-50/40 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 rounded-2xl transition-all duration-300 focus:bg-white focus:shadow-[0_0_16px_rgba(99,102,241,0.08)] peer"
                                                required={activeTab === "signup"}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                            >
                                                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {activeTab === "signup" && (
                                <div className="text-center text-xs text-slate-400 py-2">
                                    By signing up you agree to our{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); toast.info("Terms and Conditions link clicked."); }} className="text-indigo-600 font-semibold hover:underline">
                                        Terms
                                    </a>{" "}
                                    &{" "}
                                    <a href="#" onClick={(e) => { e.preventDefault(); toast.info("Privacy Policy link clicked."); }} className="text-indigo-600 font-semibold hover:underline">
                                        Privacy Policy
                                    </a>.
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-[0_8px_24px_rgba(99,102,241,0.2)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer mt-2"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        {activeTab === "signin" ? "Signing in..." : "Creating account..."}
                                    </span>
                                ) : (
                                    <span>{activeTab === "signin" ? "Sign in" : "Sign up"}</span>
                                )}
                            </Button>
                            
                            {/* Toggle link moved here at the bottom of the card */}
                            <div className="text-center text-sm text-slate-500 mt-6 pt-2 border-t border-slate-100">
                                {activeTab === "signin" ? (
                                    <span className="text-slate-500 font-medium">
                                        Don&apos;t have an account?{" "}
                                        <button 
                                            type="button" 
                                            onClick={() => handleTabChange("signup")} 
                                            className="text-indigo-600 font-bold hover:underline cursor-pointer bg-transparent border-none p-0 inline"
                                        >
                                            Sign up
                                        </button>
                                    </span>
                                ) : (
                                    <span className="text-slate-500 font-medium">
                                        Already have an account?{" "}
                                        <button 
                                            type="button" 
                                            onClick={() => handleTabChange("signin")} 
                                            className="text-indigo-600 font-bold hover:underline cursor-pointer bg-transparent border-none p-0 inline"
                                        >
                                            Sign in
                                        </button>
                                    </span>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
