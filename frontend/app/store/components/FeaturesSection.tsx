"use client";
import { Truck, ShieldCheck, Gem, HeadphonesIcon, RotateCcw, Star, Sparkles } from "lucide-react";
import { motion } from "motion/react";

const features = [
  {
    icon: Truck,
    title: "Express Shipping",
    description: "Same-day dispatch on orders placed before 3pm. Free nationwide shipping over $50.",
    color: "text-sky-600",
    bg: "bg-sky-50 border-sky-100",
    delay: 0,
  },
  {
    icon: ShieldCheck,
    title: "Secure Payments",
    description: "Instant automated VietQR integration and 256-bit SSL encrypted transactions.",
    color: "text-cyan-600",
    bg: "bg-cyan-50 border-cyan-100",
    delay: 0.05,
  },
  {
    icon: Gem,
    title: "100% Authentic Quality",
    description: "Every item is certified for authenticity with full manufacturer warranty coverage.",
    color: "text-teal-600",
    bg: "bg-teal-50 border-teal-100",
    delay: 0.1,
  },
  {
    icon: HeadphonesIcon,
    title: "24/7 Priority Support",
    description: "Dedicated customer success team available around the clock to resolve any inquiry.",
    color: "text-sky-600",
    bg: "bg-sky-50 border-sky-100",
    delay: 0.15,
  },
  {
    icon: RotateCcw,
    title: "Hassle-Free Returns",
    description: "Not completely satisfied? Exchange or return within 7 days for a prompt refund.",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-100",
    delay: 0.2,
  },
  {
    icon: Star,
    title: "Top-Rated Retailer",
    description: "Over 50,000 satisfied shoppers and a 4.9-star rating across all product lines.",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-100",
    delay: 0.25,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-5 lg:px-8 bg-gradient-to-b from-sky-50/50 via-white to-slate-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 space-y-3"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100/80 text-sky-800 border border-sky-200 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-sky-600" /> Why Choose LuxeStore
          </span>
          <h2
            className="text-slate-900 font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 4vw, 2.75rem)" }}
          >
            Crafted For Those Who Expect <br className="hidden sm:block" /> Uncompromised Excellence
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto text-sm leading-relaxed">
            Every step of your shopping experience has been engineered to be fast, secure, and genuinely premium.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description, color, bg, delay }) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay, duration: 0.5 }}
              className="group p-7 rounded-3xl border border-sky-100 bg-white/80 backdrop-blur-md shadow-xs hover:shadow-xl hover:shadow-sky-500/5 hover:border-sky-300 hover:-translate-y-1 transition-all duration-300"
            >
              <div className={`w-12 h-12 rounded-2xl ${bg} border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <h3
                className="text-slate-900 font-bold mb-2 text-base"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {title}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
