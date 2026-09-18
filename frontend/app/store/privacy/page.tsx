import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata = {
  title: "Privacy Policy | LuxeStore",
  description: "Commitment to protecting your personal data and privacy at LuxeStore.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10 space-y-8">
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
              Legal Document
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Privacy Policy
            </h1>
            <p className="text-slate-500 text-xs">Last updated: September 2026</p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6 text-xs leading-relaxed text-slate-600">
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">1. Information Collection</h3>
              <p>We collect personal information when you create an account, place an order, or subscribe to newsletters including: Full Name, Email, Phone Number, and Shipping Address.</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">2. How We Use Information</h3>
              <p>Your data is strictly utilized to process orders, confirm automated VietQR payments, send shipping updates, and improve customer service.</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">3. Data Security Standards</h3>
              <p>LuxeStore employs industry-standard SSL/TLS encryption and Bcrypt password hashing to protect personal information against unauthorized access.</p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
