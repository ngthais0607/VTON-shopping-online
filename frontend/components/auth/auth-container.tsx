// Path: frontend/components/auth/auth-container.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";


import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { safeReturnPath } from '@/lib/session';
import { apiPost, apiGet, loginSession } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Toaster, toast } from "sonner";

interface AuthContainerProps {
    defaultTab: "signin" | "signup";
}

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
        const next = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
        router.push(`${tab === 'signin' ? '/login' : '/register'}${next ? `?next=${encodeURIComponent(next)}` : ''}`);
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

        const validation = activeTab === "signin" ? loginSchema.safeParse(formData) : registerSchema.safeParse({ ...formData, username: formData.email.split('@')[0] });
        if (!validation.success) { setError(validation.error.issues[0]?.message || 'Invalid input'); return; }
        setLoading(true);

        try {
            if (activeTab === "signin") {
                // Login action
                await loginSession(formData.email, formData.password);

                try {
                    const me = await apiGet<{ role?: string }>("/users/me");
                    if (me && me.role === "admin") {
                        toast.success("Welcome Admin!", {
                            description: "Redirecting to admin dashboard...",
                        });
                        router.push("/dashboard");
                        return;
                    }
                } catch (err) {
                    console.error("Failed to check user role", err);
                }

                toast.success("Welcome to TrueLook!", {
                    description: "Redirecting to homepage...",
                });

                router.push(safeReturnPath(new URLSearchParams(window.location.search).get("next")) || "/store");
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

    return <div className="grid w-full max-w-[496px] overflow-hidden rounded border border-border bg-card lg:min-h-[720px] lg:max-w-[1120px] lg:grid-cols-[0.95fr_1.05fr]">
      <Toaster position="top-right" richColors closeButton />
      <aside className="relative isolate hidden min-w-0 flex-col justify-between overflow-hidden bg-secondary p-10 text-white lg:flex xl:p-12">
        <Image src="/images/luxury-campaign.png" alt="Elegant style in natural light" fill priority sizes="(min-width: 1280px) 532px, 45vw" className="-z-20 object-cover object-[76%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/10 to-black/15" />
        <p className="text-[10px] font-medium uppercase tracking-[0.24em]">The TrueLook Edit / 01</p>
        <div>
          <span className="mb-6 block h-px w-10 bg-[#B89B6A]" />
          <h2 className="max-w-sm font-display text-[46px] font-normal leading-[1.06] tracking-[-0.025em]">Elegance,<br /><em className="font-normal">your way.</em></h2>
          <p className="mt-5 max-w-[290px] text-[13px] leading-6 text-white/85">Your own space to save favorites and follow your shopping journey.</p>
          <p className="mt-8 border-t border-white/25 pt-5 text-[9px] uppercase tracking-[0.18em] text-white/75">Considered silhouettes. Everyday elegance.</p>
        </div>
      </aside>
      <section aria-label={activeTab === 'signin' ? 'Sign in' : 'Sign up'} className="mx-auto flex w-full max-w-[496px] min-w-0 flex-col justify-center px-6 py-9 sm:px-12 sm:py-12 lg:max-w-none lg:px-10 xl:px-16">
        <div className="mx-auto w-full max-w-[400px]">
        <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Your TrueLook account</p>
        <h1 className="mt-4 font-display text-[36px] font-normal leading-[1.12] tracking-[-0.025em] text-foreground sm:text-[42px]">{activeTab === 'signin' ? 'Welcome back.' : 'Start with TrueLook.'}</h1>
        <p className="mt-3 max-w-sm text-[13px] leading-6 text-muted-foreground">{activeTab === 'signin' ? 'Sign in to continue shopping and track your orders.' : 'Create an account to shop and manage your details.'}</p>
        <div aria-label="Authentication" className="my-6 flex border-b border-border">
          <button type="button" aria-pressed={activeTab === 'signin'} onClick={() => handleTabChange('signin')} className={`min-h-11 flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'signin' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Sign in</button>
          <button type="button" aria-pressed={activeTab === 'signup'} onClick={() => handleTabChange('signup')} className={`min-h-11 flex-1 border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'signup' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Sign up</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading} aria-describedby={error ? 'auth-error' : undefined}>
          {error && <div id="auth-error" role="alert" className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {activeTab === 'signup' && <div className="space-y-2"><label htmlFor="fullName" className="text-xs font-semibold text-foreground">Full name</label><Input id="fullName" name="fullName" autoComplete="name" placeholder="Full name" value={formData.fullName} onChange={handleChange} required className="h-12 rounded-md" /></div>}
          <div className="space-y-2"><label htmlFor="email" className="text-xs font-semibold text-foreground">{activeTab === 'signup' ? 'Email' : 'Email or username'}</label><Input id="email" name="email" type={activeTab === 'signup' ? 'email' : 'text'} autoComplete={activeTab === 'signup' ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} placeholder="Email or Username" value={formData.email} onChange={handleChange} required className="h-12 rounded-md" /></div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-semibold text-foreground">Password</label>
            <div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'} placeholder="Password" value={formData.password} onChange={handleChange} required aria-describedby={activeTab === 'signup' ? 'password-help' : undefined} className="h-12 rounded-md pr-12" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></div>
            {activeTab === 'signup' && <p id="password-help" className="text-xs text-muted-foreground">At least 8 characters; maximum 72 UTF-8 bytes.</p>}
          </div>
          {activeTab === 'signup' && <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">Confirm password</label>
            <div className="relative"><Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} required className="h-12 rounded-md pr-12" /><button type="button" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">{showConfirmPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></div>
          </div>}
          {activeTab === 'signup' && <p className="text-xs leading-relaxed text-muted-foreground">By signing up, you agree to the <Link href="/store/terms" className="font-medium text-primary underline underline-offset-4">Terms</Link> and <Link href="/store/privacy" className="font-medium text-primary underline underline-offset-4">Privacy Policy</Link>.</p>}
          <Button type="submit" disabled={loading} className="h-12 w-full justify-between rounded-md px-5">{loading ? (activeTab === 'signin' ? 'Signing in...' : 'Creating account...') : (activeTab === 'signin' ? 'Sign in' : 'Sign up')}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
        </form>
        <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">{activeTab === 'signin' ? 'New here?' : 'Already have an account?'} <button type="button" onClick={() => handleTabChange(activeTab === 'signin' ? 'signup' : 'signin')} className="font-medium text-primary underline underline-offset-4">{activeTab === 'signin' ? 'Sign up' : 'Sign in'}</button></p>
        </div>
      </section>
    </div>;
}
