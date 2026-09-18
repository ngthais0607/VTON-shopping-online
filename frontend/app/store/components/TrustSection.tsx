"use client";
import { Star, Quote } from "lucide-react";
import { motion } from "motion/react";

const reviews = [
  {
    id: 1,
    name: "Sarah Chen",
    role: "Designer, Figma",
    avatar: "SC",
    avatarColor: "#4f46e5",
    rating: 5,
    text: "Ordered the Arc Pro Watch and it arrived next day, perfectly packaged. The quality exceeded my expectations — this is now my daily driver.",
    product: "Arc Pro Watch Series 9",
  },
  {
    id: 2,
    name: "Marcus Webb",
    role: "Software Engineer",
    avatar: "MW",
    avatarColor: "#0ea5e9",
    rating: 5,
    text: "The Studio Pro Headphones are insane for the price. ANC works great on flights and the battery lasts my entire workday and then some.",
    product: "Studio Pro Headphones",
  },
  {
    id: 3,
    name: "Priya Nair",
    role: "Photographer",
    avatar: "PN",
    avatarColor: "#7c3aed",
    rating: 5,
    text: "Bought the Maestro lens and the bokeh is just stunning. Customer support was also incredibly helpful when I had a setup question.",
    product: "Maestro Camera Lens",
  },
];

const trustBadges = [
  { label: "SSL Secured", icon: "🔒" },
  { label: "Money-back Guarantee", icon: "💰" },
  { label: "Authentic Products", icon: "✅" },
  { label: "Fast Dispatch", icon: "⚡" },
];

export function TrustSection() {
  return (
    <section className="py-24 px-5 lg:px-8 bg-gradient-to-b from-slate-50 via-sky-50/30 to-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs text-sky-700 bg-sky-100/80 px-3.5 py-1.5 rounded-full border border-sky-200 font-bold uppercase tracking-widest mb-4">
            Customer Love
          </span>
          <h2
            className="text-slate-900 mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.02em" }}
          >
            94,000+ happy customers
          </h2>
          <div className="flex items-center justify-center gap-2 mt-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
            ))}
            <span className="text-slate-900 font-bold ml-1">4.9</span>
            <span className="text-slate-500 text-sm">average rating</span>
          </div>
        </motion.div>

        {/* Reviews grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
          {reviews.map((review, i) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white/90 backdrop-blur-md rounded-2xl p-6 border border-sky-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_24px_rgba(14,165,233,0.08)] hover:border-sky-200 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Quote className="w-7 h-7 text-sky-200 mb-4" fill="currentColor" />
              <p className="text-sm text-slate-700 leading-relaxed mb-5">&quot;{review.text}&quot;</p>
              <div className="flex items-center gap-0.5 mb-4">
                {[...Array(review.rating)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: review.avatarColor }}
                >
                  {review.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{review.name}</p>
                  <p className="text-xs text-slate-500">{review.role}</p>
                </div>
              </div>
              <p className="text-xs text-sky-600 mt-3 font-medium">Verified purchase: {review.product}</p>
            </motion.div>
          ))}
        </div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          {trustBadges.map(({ label, icon }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-border text-sm text-foreground font-medium shadow-sm"
            >
              <span className="text-base">{icon}</span>
              {label}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
