import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { MapPin, Clock } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Careers | LuxeStore",
  description: "Join LuxeStore team - Vibrant work culture and career growth opportunities.",
};

const jobs = [
  { title: "Senior Frontend Engineer (Next.js / React)", location: "New York, NY", type: "Full-time", dept: "Engineering" },
  { title: "E-Commerce Operations Specialist", location: "San Francisco, CA", type: "Full-time", dept: "Operations" },
  { title: "Customer Success Manager", location: "Remote / Hybrid", type: "Full-time", dept: "Support" },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 py-10 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              Careers at LuxeStore
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
              Build The Future Of E-Commerce
            </h1>
            <p className="text-slate-500 text-sm">
              We're looking for passionate individuals to help shape high-quality retail experiences worldwide.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Open Roles</h3>
            {jobs.map((job, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-300 transition-all">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">{job.dept}</span>
                  <h4 className="font-bold text-slate-900 text-base">{job.title}</h4>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {job.type}</span>
                  </div>
                </div>

                <Link
                  href="/store/contact"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-indigo-600 transition-colors shrink-0 text-center"
                >
                  Apply Now
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
