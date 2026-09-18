// Path: frontend/app/register/page.tsx
"use client";

import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import { AuthContainer } from "@/components/auth/auth-container";

export default function RegisterPage() {
    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#f5f7fb] to-[#f1f3f9] text-slate-800 font-sans relative overflow-hidden">
            {/* Ambient Background Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-violet-200/25 rounded-full blur-[140px] pointer-events-none" />

            {/* Top Navigation Bar */}
            <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-20">
                {/* Left: Back to store */}
                <div className="flex items-center">
                    <Link 
                        href="/store" 
                        className="inline-flex items-center gap-2 group text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                        <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.03)] text-slate-500 group-hover:text-indigo-600 group-hover:border-indigo-100 group-hover:shadow-[0_4px_16px_rgba(99,102,241,0.08)] transition-all">
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                        </span>
                        Back to store
                    </Link>
                </div>

                {/* Center: LuxeStore Logo */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Zap className="h-5 w-5 fill-white text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-900">
                        <span className="text-indigo-600">Luxe</span>Store
                    </span>
                </div>

                {/* Right: Spacer for logo centering alignment */}
                <div className="w-[130px] hidden sm:block" />
            </header>

            {/* Center Content Column */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
                {/* Form Card Container */}
                <AuthContainer defaultTab="signup" />
            </main>

            {/* Simple Footer */}
            <footer className="w-full text-center py-6 text-xs text-slate-400 relative z-10 border-t border-slate-100/50 bg-white/10 backdrop-blur-sm">
                © {new Date().getFullYear()} LuxeStore. All rights reserved.
            </footer>
        </div>
    );
}
