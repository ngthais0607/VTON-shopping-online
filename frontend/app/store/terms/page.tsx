import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata = {
  title: "Terms of Service | LuxeStore",
  description: "Terms of service and user agreement for LuxeStore retail platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10 space-y-8">
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
              Legal Agreement
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Terms of Service
            </h1>
            <p className="text-slate-500 text-xs">Last updated: September 2026</p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6 text-xs leading-relaxed text-slate-600">
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">1. Acceptance of Terms</h3>
              <p>By accessing or placing orders on LuxeStore, you agree to comply with and be bound by these service terms.</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">2. Pricing & Orders</h3>
              <p>All prices displayed are subject to promotional updates. LuxeStore reserves the right to adjust pricing or cancel orders resulting from system pricing errors.</p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
