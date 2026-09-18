import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Cookie } from "lucide-react";

export const metadata = {
  title: "Cookie Policy | LuxeStore",
  description: "Information regarding cookie usage and browser storage on LuxeStore.",
};

export default function CookiePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10 space-y-8">
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider">
              Cookie Preferences
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Cookie Policy
            </h1>
            <p className="text-slate-500 text-xs">Last updated: September 2026</p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6 text-xs leading-relaxed text-slate-600">
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-600" />
                What Are Cookies?
              </h3>
              <p>Cookies are small text files stored in your browser that help remember JWT login states, SWR shopping cart caches, and personalized settings.</p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
