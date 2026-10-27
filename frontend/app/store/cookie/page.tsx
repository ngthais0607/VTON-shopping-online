import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata = { title: "Cookies and browser storage | TrueLook" };

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header currentUser={null} />
      <main className="flex-1 pt-28 pb-16 px-6 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-slate-900">Cookies and browser storage</h1>
        <p className="mt-6 text-slate-600 leading-relaxed">Sign-in uses an HttpOnly refresh cookie; access tokens stay in memory. The cart and wishlist use local browser storage. Wishlist items do not sync between devices. Signing out revokes the current refresh session; issued access tokens expire normally.</p>
      </main>
      <Footer />
    </div>
  );
}
