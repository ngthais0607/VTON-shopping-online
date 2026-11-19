// Path: frontend/components/auth/auth-container.tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
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

    // Switch tabs in place: swapping the route remounts the form and makes the layout jump.
    const syncUrl = (tab: "signin" | "signup") => {
        const next = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
        window.history.replaceState(null, "", `${tab === "signin" ? "/login" : "/register"}${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    };

    const handleTabChange = (tab: "signin" | "signup") => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        setError("");
        syncUrl(tab);
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
                    syncUrl("signin");
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

    const isSignup = activeTab === "signup";
    const inputClass = "h-11 rounded-md";

    return <>
      <Toaster position="top-right" richColors closeButton />
      <div className="grid w-full max-w-[496px] overflow-hidden rounded border border-border bg-card lg:min-h-[800px] lg:max-w-[1120px] lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative isolate hidden min-w-0 flex-col justify-between overflow-hidden bg-secondary p-10 text-white lg:flex xl:p-12">
        <Image src="/images/luxury-campaign.webp" alt="Elegant style in natural light" fill priority sizes="(min-width: 1280px) 532px, 45vw" className="-z-20 object-cover object-[76%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/10 to-black/15" />
        <p className="text-[10px] font-medium uppercase tracking-[0.24em]">The TrueLook Edit / 01</p>
        <div>
          <span className="mb-6 block h-px w-10 bg-[#B89B6A]" />
          <h2 className="max-w-sm font-display text-[46px] font-normal leading-[1.06] tracking-[-0.025em]">Elegance,<br /><em className="font-normal">your way.</em></h2>
          <p className="mt-5 max-w-[290px] text-[13px] leading-6 text-white/85">Your own space to save favorites and follow your shopping journey.</p>
          <p className="mt-8 border-t border-white/25 pt-5 text-[9px] uppercase tracking-[0.18em] text-white/75">Considered silhouettes. Everyday elegance.</p>
        </div>
      </aside>
      <section aria-label={isSignup ? 'Sign up' : 'Sign in'} className="mx-auto flex w-full max-w-[496px] min-w-0 flex-col justify-start px-6 py-9 sm:px-12 sm:py-12 lg:max-w-none lg:px-10 lg:py-10 xl:px-16">
        <div className="mx-auto w-full max-w-[400px]">
        <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Your TrueLook account</p>
        {/* Fixed-height heading block: copy changes never move the tabs or the form. */}
        <div className="min-h-[104px]">
          <h1 className="mt-4 font-display text-[36px] font-normal leading-[1.12] tracking-[-0.025em] text-foreground sm:text-[42px]">{isSignup ? 'Start with TrueLook.' : 'Welcome back.'}</h1>
          <p className="mt-3 max-w-sm text-[13px] leading-6 text-muted-foreground">{isSignup ? 'Create an account to shop and manage your details.' : 'Sign in to continue shopping and track your orders.'}</p>
        </div>
        <div role="tablist" aria-label="Authentication" className="relative mb-6 grid grid-cols-2 rounded-md bg-muted p-1">
          <span aria-hidden="true" className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded bg-background shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${isSignup ? 'translate-x-full' : 'translate-x-0'}`} />
          {(['signin', 'signup'] as const).map((tab) => <button key={tab} type="button" role="tab" id={`auth-tab-${tab}`} aria-selected={activeTab === tab} aria-controls="auth-panel" onClick={() => handleTabChange(tab)} className={`relative z-10 min-h-10 rounded py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{tab === 'signin' ? 'Sign in' : 'Sign up'}</button>)}
        </div>
        <form id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${activeTab}`} onSubmit={handleSubmit} aria-busy={loading} aria-describedby={error ? 'auth-error' : undefined}>
          <Collapse open={!!error}>{error && <div id="auth-error" role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}</Collapse>
          <Collapse open={isSignup}><div className="pb-4"><label htmlFor="fullName" className="mb-2 block text-xs font-semibold text-foreground">Full name</label><Input id="fullName" name="fullName" autoComplete="name" placeholder="Full name" value={formData.fullName} onChange={handleChange} required={isSignup} className={inputClass} /></div></Collapse>
          <div className="pb-4"><label htmlFor="email" className="mb-2 block text-xs font-semibold text-foreground">{isSignup ? 'Email' : 'Email or username'}</label><Input id="email" name="email" type={isSignup ? 'email' : 'text'} autoComplete={isSignup ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} placeholder="Email or Username" value={formData.email} onChange={handleChange} required className={inputClass} /></div>
          <div className="pb-4">
            <label htmlFor="password" className="mb-2 block text-xs font-semibold text-foreground">Password</label>
            <div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="Password" value={formData.password} onChange={handleChange} required aria-describedby={isSignup ? 'password-help' : undefined} className={`${inputClass} pr-12`} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></div>
            <Collapse open={isSignup}><p id="password-help" className="pt-2 text-xs text-muted-foreground">At least 8 characters; maximum 72 UTF-8 bytes.</p></Collapse>
          </div>
          <Collapse open={isSignup}><div className="pb-4">
            <label htmlFor="confirmPassword" className="mb-2 block text-xs font-semibold text-foreground">Confirm password</label>
            <div className="relative"><Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} required={isSignup} className={`${inputClass} pr-12`} /><button type="button" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">{showConfirmPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}</button></div>
          </div></Collapse>
          <Collapse open={isSignup}><p className="pb-4 text-xs leading-relaxed text-muted-foreground">By signing up, you agree to the <Link href="/store/terms" className="font-medium text-primary underline underline-offset-4">Terms</Link> and <Link href="/store/privacy" className="font-medium text-primary underline underline-offset-4">Privacy Policy</Link>.</p></Collapse>
          <Button type="submit" disabled={loading} className="h-11 w-full justify-between rounded-md px-5">{loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Sign up' : 'Sign in')}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
        </form>
        <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">{isSignup ? 'Already have an account?' : 'New here?'} <button type="button" onClick={() => handleTabChange(isSignup ? 'signin' : 'signup')} className="font-medium text-primary underline underline-offset-4">{isSignup ? 'Sign in' : 'Sign up'}</button></p>
        </div>
      </section>
      </div>
    </>;
}

/** Height-animated container: collapsed content is inert, so it cannot be tabbed to or announced. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
    return <div inert={!open} aria-hidden={!open} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="-mx-1 min-h-0 overflow-hidden px-1">{children}</div>
    </div>;
}
