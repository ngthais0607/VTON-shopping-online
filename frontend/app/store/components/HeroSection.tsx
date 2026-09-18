"use client";
import Image from "next/image";
import { ArrowRight, Star, TrendingUp, Users, Package, Sparkles } from "lucide-react";
import { motion } from "motion/react";

const floatingCards = [
  {
    id: 1,
    name: "Arc Pro Watch",
    price: "$349",
    category: "Wearables",
    img: "https://images.unsplash.com/photo-1631863552122-3072cf599a46?w=200&h=200&fit=crop&auto=format",
    badge: "New",
    badgeColor: "bg-sky-100 text-sky-800 border border-sky-200",
    delay: 0,
    position: "top-12 -right-4 lg:right-4",
    rotation: "rotate-2",
  },
  {
    id: 2,
    name: "Studio Headphones",
    price: "$189",
    category: "Audio",
    img: "https://images.unsplash.com/photo-1755719401551-9e2b4be00555?w=200&h=200&fit=crop&auto=format",
    badge: "Popular",
    badgeColor: "bg-cyan-100 text-cyan-800 border border-cyan-200",
    delay: 0.15,
    position: "bottom-20 -right-2 lg:right-12",
    rotation: "-rotate-1",
  },
  {
    id: 3,
    name: "Noir Perfume",
    price: "$124",
    category: "Fragrance",
    img: "https://images.unsplash.com/photo-1768025719875-48ed072f3084?w=200&h=200&fit=crop&auto=format",
    badge: "Best Seller",
    badgeColor: "bg-sky-100 text-sky-800 border border-sky-200",
    delay: 0.3,
    position: "top-36 -left-6 lg:left-4",
    rotation: "-rotate-2",
  },
];

const stats = [
  { icon: Package, value: "12,400+", label: "Active Products" },
  { icon: Users, value: "94,000+", label: "Happy Customers" },
  { icon: TrendingUp, value: "320,000+", label: "Orders Fulfilled" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export function HeroSection({ onShopNow }: { onShopNow: () => void }) {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-20 pb-16 overflow-hidden bg-gradient-to-br from-[#f0f9ff] via-[#e0f2fe] via-50% to-[#f8fafc]">
      {/* Soft Pastel Ocean Blue Mesh Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[650px] h-[650px] bg-sky-200/40 rounded-full blur-[110px] animate-pulse" />
        <div className="absolute bottom-0 left-1/4 w-[550px] h-[550px] bg-cyan-200/35 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 left-1/2 w-[400px] h-[400px] bg-indigo-100/30 rounded-full blur-[90px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.07]" />
      </div>

      <div className="max-w-7xl mx-auto px-5 lg:px-8 w-full py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.1 } } }}
            className="space-y-8"
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-100/80 border border-sky-200/80 text-sky-800 text-xs font-bold tracking-wider uppercase backdrop-blur-md shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-sky-600 animate-spin" style={{ animationDuration: "6s" }} />
                Free express shipping on orders over $50
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-slate-900 tracking-tight font-extrabold"
              style={{
                fontFamily: "var(--font-display)",
                lineHeight: 1.05,
                fontSize: "clamp(2.8rem, 5.5vw, 4.5rem)",
              }}
            >
              Discover Luxe{" "}
              <span className="bg-gradient-to-r from-sky-600 via-cyan-600 to-blue-700 bg-clip-text text-transparent">
                Ocean Collection
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-base text-slate-600 leading-relaxed max-w-lg"
            >
              Curated premium lifestyle, fashion, and tech essentials. Uncompromising quality, seamless VietQR payments, and instant 24-hour dispatch.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={onShopNow}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white text-sm font-bold shadow-lg shadow-sky-500/25 hover:shadow-sky-500/35 active:scale-95 transition-all cursor-pointer"
              >
                Explore Collection
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onShopNow}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-white/90 hover:bg-white text-slate-800 text-sm font-bold border border-sky-200/80 backdrop-blur-md active:scale-95 transition-all shadow-xs hover:border-sky-300 cursor-pointer"
              >
                Browse All Items
              </button>
            </motion.div>

            {/* Customer Rating */}
            <motion.div variants={fadeUp} className="flex items-center gap-4 pt-4 border-t border-sky-200/60">
              <div className="flex -space-x-2.5">
                {["0284C7", "0369A1", "0891B2", "0284C7"].map((color, i) => (
                  <div
                    key={i}
                    className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-md"
                    style={{ backgroundColor: `#${color}` }}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                  <span className="text-sm font-extrabold text-slate-900 ml-1">4.9 / 5.0</span>
                </div>
                <p className="text-xs text-slate-500">Trusted by 50,000+ satisfied buyers</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Floating Product Visuals */}
          <div className="relative h-[480px] hidden lg:block">
            {floatingCards.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: card.delay + 0.3, duration: 0.6 }}
                className={`absolute ${card.position} ${card.rotation} z-20`}
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4.5 + card.delay, repeat: Infinity, ease: "easeInOut", delay: card.delay }}
                  className="bg-white/90 backdrop-blur-2xl rounded-2xl p-3.5 shadow-xl shadow-sky-900/5 border border-sky-100 w-56"
                >
                  <div className="relative rounded-xl overflow-hidden bg-sky-50/50 aspect-square mb-3">
                    <Image
                      src={card.img}
                      alt={card.name}
                      fill
                      className="object-cover"
                    />
                    <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-0.5">{card.category}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-900 font-bold">{card.name}</span>
                    <span className="text-xs text-sky-600 font-extrabold">{card.price}</span>
                  </div>
                </motion.div>
              </motion.div>
            ))}

            {/* Hero Main Spotlight Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              <div className="w-72 bg-white/95 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl shadow-sky-600/10 border border-sky-200/80">
                <div className="aspect-square rounded-2xl overflow-hidden bg-sky-50 mb-4 relative group">
                  <Image
                    src="https://images.unsplash.com/photo-1562907550-096d3bf9b25c?w=400&h=400&fit=crop&auto=format"
                    alt="Featured laptop"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider">Premium Series</span>
                  <p className="text-base font-extrabold text-slate-900">Volta Pro 14 Studio</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sky-700 font-extrabold text-lg">$1,299</span>
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200">
                      In Stock
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-sky-200/80 shadow-md shadow-sky-950/5"
        >
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100/80 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                  {value}
                </div>
                <div className="text-xs text-slate-500 font-medium">{label}</div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
