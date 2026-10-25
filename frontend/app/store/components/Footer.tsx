import Link from "next/link";
import { Zap } from "lucide-react";

const linkGroups = [
  {
    title: "Shop",
    items: [
      { label: "Catalog", href: "/store" },
    ]
  },
  {
    title: "Support",
    items: [
      { label: "Help Center", href: "/store/help" },
      { label: "Track Order", href: "/store/orders" },
      { label: "Returns", href: "/store/returns" },
      { label: "Contact Us", href: "/store/contact" },
    ]
  },
  {
    title: "Company",
    items: [
      { label: "About Us", href: "/store/about" },
    ]
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy Policy", href: "/store/privacy" },
      { label: "Terms of Service", href: "/store/terms" },
      { label: "Cookie Policy", href: "/store/cookie" },
    ]
  }
];

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10">
          {/* Brand Column */}
          <div className="col-span-2 lg:col-span-1 space-y-4">
            <Link href="/store" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Zap className="w-5 h-5 text-white" fill="white" />
              </div>
              <span className="text-white text-lg tracking-tight font-extrabold" style={{ fontFamily: "var(--font-display)" }}>
                True<span className="text-indigo-400">Look</span>
              </span>
            </Link>

            <p className="text-xs text-slate-400 leading-relaxed">
              TrueLook shop demo. Explore the catalog, choose product variants and try Cash on Delivery checkout. No real orders are fulfilled.
            </p>

          </div>

          {/* Navigation Links */}
          {linkGroups.map((group) => (
            <div key={group.title}>
              <h4 className="text-white text-xs uppercase tracking-wider font-extrabold mb-4" style={{ fontFamily: "var(--font-display)" }}>
                {group.title}
              </h4>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-xs text-slate-400 hover:text-indigo-300 hover:underline underline-offset-4 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-14 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 TrueLook E-Commerce Platform. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">Demo checkout</span>
            {["COD", "VietQR simulation"].map((name) => (
              <span key={name} className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-semibold text-[11px] border border-slate-700/60">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
