import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { HelpCircle, ChevronRight } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Help Center | LuxeStore",
  description: "Find answers to frequently asked questions about orders, payments, shipping, and returns.",
};

const faqs = [
  {
    category: "VietQR Payment & Orders",
    questions: [
      { q: "How do I pay using VietQR instant transfer?", a: "After placing an order, a QR code containing the exact amount and memo will be displayed. Scan it using your banking app for instant automated payment verification." },
      { q: "How long is a pending order valid?", a: "Pending orders remain active for 30 minutes. If unpaid, the system automatically cancels the order and releases reserved stock." }
    ]
  },
  {
    category: "Shipping & Delivery",
    questions: [
      { q: "How fast is shipping?", a: "Major metropolitan orders deliver within 1-2 business days. Regional and nationwide shipping takes 2-4 business days." },
      { q: "How can I track my shipment?", a: "You can navigate to the 'My Orders' section in your account dashboard to view real-time shipping updates." }
    ]
  },
  {
    category: "Returns & Exchanges",
    questions: [
      { q: "What is your return policy?", a: "LuxeStore offers 7-day hassle-free returns for defective items or shipping damage." }
    ]
  }
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        {/* Search Header */}
        <section className="bg-gradient-to-b from-indigo-900 to-slate-900 text-white py-16 px-5 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto space-y-4">
            <h1 className="text-3xl md:text-4xl font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
              Help & Support Center
            </h1>
            <p className="text-slate-300 text-sm">
              How can we help you today? Search or browse through common questions.
            </p>
          </div>
        </section>

        {/* FAQs list */}
        <section className="max-w-4xl mx-auto px-5 lg:px-8 py-14 space-y-10">
          {faqs.map((cat, idx) => (
            <div key={idx} className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                {cat.category}
              </h3>
              <div className="space-y-4 divide-y divide-slate-100">
                {cat.questions.map((item, qIdx) => (
                  <div key={qIdx} className="pt-4 first:pt-0 space-y-1.5">
                    <h4 className="font-bold text-slate-800 text-sm">{item.q}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="text-center pt-6">
            <p className="text-xs text-slate-500 mb-3">Still have questions?</p>
            <Link
              href="/store/contact"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-md hover:bg-indigo-700 transition-all"
            >
              Contact Support Team <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
