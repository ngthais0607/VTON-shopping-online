import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Sparkles, ShieldCheck, Truck, Heart } from "lucide-react";

export const metadata = {
  title: "About Us | LuxeStore",
  description: "Learn about LuxeStore's story, mission, and core brand values.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        {/* Hero Banner */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-900 via-indigo-950 to-slate-950 text-white py-20 px-5 lg:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.25),transparent_50%)]" />
          <div className="max-w-5xl mx-auto text-center relative z-10 space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" /> Our Story
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Redefining <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">Premium Retail</span>
            </h1>
            <p className="text-slate-300 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
              Founded in 2019, LuxeStore delivers high-end lifestyle & technology products paired with uncompromised customer service.
            </p>
          </div>
        </section>

        {/* Core Values */}
        <section className="max-w-7xl mx-auto px-5 lg:px-8 -mt-10 relative z-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Authenticity Guaranteed</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Every item is 100% verified for quality and backed by manufacturer warranty.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Express Dispatch</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Automated fulfillment pipeline ensuring orders ship within 24 hours.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                <Heart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base mb-1">Customer First</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Dedicated 24/7 customer support with hassle-free 7-day returns.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Company Stats */}
        <section className="max-w-7xl mx-auto px-5 lg:px-8 py-20">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-3xl p-10 text-white shadow-2xl flex flex-col md:flex-row items-center justify-around gap-8 text-center">
            <div>
              <div className="text-4xl font-extrabold mb-1">50,000+</div>
              <div className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Happy Customers</div>
            </div>
            <div className="h-12 w-px bg-indigo-400/40 hidden md:block" />
            <div>
              <div className="text-4xl font-extrabold mb-1">100%</div>
              <div className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Verified Products</div>
            </div>
            <div className="h-12 w-px bg-indigo-400/40 hidden md:block" />
            <div>
              <div className="text-4xl font-extrabold mb-1">4.9 / 5.0</div>
              <div className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Customer Rating</div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
