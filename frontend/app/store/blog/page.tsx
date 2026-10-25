import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata = { title: "Blog | TrueLook" };

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header currentUser={null} />
      <main className="flex-1 pt-28 pb-16 px-6 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-slate-900">Blog</h1>
        <p className="mt-6 text-slate-600 leading-relaxed">TrueLook is a shop demo. No blog articles have been published.</p>
      </main>
      <Footer />
    </div>
  );
}
