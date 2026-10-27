import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata = { title: "Contact | TrueLook" };

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header currentUser={null} />
      <main className="flex-1 pt-28 pb-16 px-6 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-slate-900">Contact</h1>
        <p className="mt-6 text-slate-600 leading-relaxed">This is a local shop demonstration. No support inbox, phone line or message delivery is connected. Contact the person presenting the demo for assistance.</p>
      </main>
      <Footer />
    </div>
  );
}
