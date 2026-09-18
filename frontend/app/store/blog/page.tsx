import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Calendar, User, ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Blog & Journal | LuxeStore",
  description: "Stay updated with retail trends, fashion guides, and product announcements.",
};

const posts = [
  {
    id: 1,
    title: "Minimalist Retail & Lifestyle Trends for 2026",
    excerpt: "Explore sleek fashion combinations and technology products designed for modern living.",
    category: "Trends",
    date: "Sep 14, 2026",
    author: "Luxe Editorial",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80"
  },
  {
    id: 2,
    title: "The Ultimate Sizing & Fit Guide for Online Shopping",
    excerpt: "Simple tips to ensure every item you order fits perfectly every time.",
    category: "Guides",
    date: "Sep 10, 2026",
    author: "Style Guide",
    image: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80"
  },
  {
    id: 3,
    title: "Instant VietQR Banking Payments Explained",
    excerpt: "How LuxeStore leverages real-time banking webhooks for instant order fulfillment.",
    category: "Technology",
    date: "Sep 05, 2026",
    author: "Tech Team",
    image: "https://images.unsplash.com/photo-1556742049-0a67cf5723b7?w=800&q=80"
  }
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header currentUser={null} />

      <main className="flex-1 pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-10 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider">
              Luxe Journal
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
              Featured Articles & Stories
            </h1>
            <p className="text-slate-500 text-sm">
              Discover style inspiration, product updates, and behind-the-scenes insights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {posts.map((post) => (
              <article key={post.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all group flex flex-col">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[11px] font-bold text-indigo-600 shadow-sm">
                    {post.category}
                  </span>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {post.date}</span>
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {post.author}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                      {post.excerpt}
                    </p>
                  </div>

                  <Link href={`/store/blog`} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 pt-2">
                    Read Article <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
