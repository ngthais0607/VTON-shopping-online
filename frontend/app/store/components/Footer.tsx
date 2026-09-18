import Link from "next/link";
import { Zap, Twitter, Instagram, Github, Youtube, Mail, Phone, MapPin } from "lucide-react";

const linkGroups = [
  {
    title: "Shop",
    items: [
      { label: "New Arrivals", href: "/store" },
      { label: "Best Sellers", href: "/store" },
      { label: "Sale Items", href: "/store" },
      { label: "Gift Cards", href: "/store/help" },
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
      { label: "Blog", href: "/store/blog" },
      { label: "Careers", href: "/store/careers" },
      { label: "Press", href: "/store/press" },
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

const socials = [
  { icon: Twitter, label: "Twitter", href: "https://twitter.com" },
  { icon: Instagram, label: "Instagram", href: "https://instagram.com" },
  { icon: Github, label: "GitHub", href: "https://github.com" },
  { icon: Youtube, label: "YouTube", href: "https://youtube.com" },
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
                Luxe<span className="text-indigo-400">Store</span>
              </span>
            </Link>

            <p className="text-xs text-slate-400 leading-relaxed">
              Premium retail experience. Curated high-quality products with trusted warranty and fast doorstep delivery worldwide.
            </p>

            <div className="space-y-2 text-xs text-slate-400 pt-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>123 Luxe Plaza, Suite 400, New York, NY</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>support@luxestore.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>+1 (800) 888-9999</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3">
              {socials.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-xs"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
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
          <p>© 2026 LuxeStore E-Commerce Platform. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">Payments Secured By</span>
            {["VietQR", "Visa", "Mastercard", "PayPal"].map((name) => (
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
