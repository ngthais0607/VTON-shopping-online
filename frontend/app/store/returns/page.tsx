import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { RefreshCw, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Returns Policy | LuxeStore",
  description: "Transparent 7-day return and refund policy at LuxeStore.",
};

export default function ReturnsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10 space-y-8">
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              Returns & Refunds
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Product Return Policy
            </h1>
            <p className="text-slate-500 text-sm">
              LuxeStore guarantees a seamless shopping experience with flexible 7-day returns.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Eligible Return Conditions
            </h3>
            <ul className="space-y-3 text-xs text-slate-600 list-disc pl-5">
              <li>Item is unused, in original packaging with tags intact.</li>
              <li>Defective product or manufacturing defect upon unboxing.</li>
              <li>Incorrect item, wrong color, or incorrect size delivered.</li>
              <li>Return request submitted within <strong>7 days</strong> of delivery.</li>
            </ul>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-600" />
              3-Step Return Process
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">1</span>
                <h4 className="font-bold text-slate-900">Contact Support</h4>
                <p className="text-slate-500">Submit a return request via the Contact page with your Order ID.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">2</span>
                <h4 className="font-bold text-slate-900">Ship Item Back</h4>
                <p className="text-slate-500">Pack the item securely and ship to our fulfillment center.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">3</span>
                <h4 className="font-bold text-slate-900">Receive Replacement</h4>
                <p className="text-slate-500">Once inspected, a replacement or refund is issued within 48 hours.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
