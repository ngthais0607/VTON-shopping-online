import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Newspaper, Download } from "lucide-react";

export const metadata = {
  title: "Press & Media | LuxeStore Press",
  description: "Official press kits, media guidelines, and news releases for LuxeStore.",
};

export default function PressPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10 space-y-10">
          <div className="space-y-3">
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider">
              Press & Media
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Press Center & Brand Assets
            </h1>
            <p className="text-slate-500 text-sm">
              Official media resources and press releases for publications and partners.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-indigo-600" />
              Official Media Kit
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Download high-resolution brand logos, product photography, and brand identity guidelines for editorial use.
            </p>
            <a
              href="/store/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs hover:bg-indigo-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Media Kit (.ZIP)
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
