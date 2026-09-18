"use client";
import { ArrowRight, ShoppingBag, Layers, Sparkles } from "lucide-react";
import { motion } from "motion/react";

export function CTASection({ onShopNow }: { onShopNow: () => void }) {
  return (
    <section className="py-28 px-5 lg:px-8 relative overflow-hidden bg-slate-950 text-white">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-sky-500/25 via-cyan-500/15 to-transparent rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-blue-600/20 via-sky-400/10 to-transparent rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:32px_32px] opacity-15" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center bg-slate-900/80 backdrop-blur-2xl p-10 md:p-16 rounded-3xl border border-sky-500/30 shadow-[0_25px_90px_rgba(14,165,233,0.2)] space-y-6"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            Over 12,400+ Premium Products Available
          </span>

          <h2
            className="text-white font-extrabold tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.2rem, 5vw, 3.6rem)",
              lineHeight: 1.05,
            }}
          >
            Ready To Upgrade Your <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-blue-300 bg-clip-text text-transparent">
              Shopping Experience?
            </span>
          </h2>

          <p className="text-slate-300 text-base max-w-xl mx-auto leading-relaxed">
            Join 50,000+ satisfied buyers shopping with complete confidence. 100% authentic quality, express shipping, and instant VietQR payments.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={onShopNow}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white font-bold text-sm shadow-xl shadow-sky-500/30 hover:shadow-sky-500/50 active:scale-95 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-5 h-5" />
              Start Shopping Now
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onShopNow}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm border border-slate-700/80 backdrop-blur-md active:scale-95 transition-all cursor-pointer"
            >
              <Layers className="w-5 h-5 text-sky-400" />
              Explore Categories
            </button>
          </div>

          {/* Mini Stats */}
          <div className="pt-10 grid grid-cols-3 gap-6 max-w-md mx-auto border-t border-slate-800/80">
            {[
              { value: "7-Day", label: "Easy Returns" },
              { value: "Free", label: "Orders $50+" },
              { value: "24/7", label: "Instant Support" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div
                  className="text-white font-extrabold text-lg"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {value}
                </div>
                <div className="text-slate-400 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
