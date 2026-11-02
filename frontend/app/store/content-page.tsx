import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";

type ContentPageProps = { eyebrow: string; title: string; description: string; children: ReactNode };
const informationLinks = [["/store/about", "About TrueLook"], ["/store/help", "Shopping guide"], ["/store/returns", "Returns & cancellations"], ["/store/contact", "Contact"]] as const;

export function ContentPage({ eyebrow, title, description, children }: ContentPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-20 pt-28 sm:px-8 lg:px-12 lg:pt-36">
        <div className="border-b border-[#E8E3DB] pb-10 sm:pb-14">
          <Link href="/store" className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-[#6B6761] hover:text-[#1C1C1C]">TrueLook <span aria-hidden="true">/</span> {eyebrow}</Link>
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:gap-16">
            <h1 className="max-w-3xl text-4xl font-medium leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-7xl" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
            <p className="max-w-xl text-sm leading-7 text-[#6B6761] sm:text-base">{description}</p>
          </div>
        </div>
        <div className="grid gap-10 pt-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:pt-14">
          <aside>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B6761]">Store information</p>
            <nav aria-label="TrueLook information" className="grid grid-cols-2 gap-x-5 gap-y-1 lg:grid-cols-1">
              {informationLinks.map(([href, label]) => <Link key={href} href={href} className="flex min-h-11 items-center justify-between gap-2 border-b border-[#E8E3DB] py-3 text-sm hover:text-[#1C1C1C]">{label}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /></Link>)}
            </nav>
          </aside>
          <div className="min-w-0 space-y-5">{children}</div>
        </div>
        <div className="mt-16 flex flex-col justify-between gap-5 border-y border-[#E8E3DB] py-7 sm:flex-row sm:items-center">
          <p className="text-xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Find what feels like you.</p>
          <Link href="/store" className="inline-flex min-h-11 items-center justify-between gap-10 bg-[#1C1C1C] px-5 py-3 text-sm font-medium text-white hover:bg-[#1C1C1C]">Explore the store <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function ContentSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section className="grid gap-4 border border-[#E8E3DB] bg-white p-6 sm:grid-cols-[40px_minmax(0,1fr)] sm:p-8">
    <span aria-hidden="true" className="pt-1 font-mono text-xs text-[#1C1C1C]">{number}</span>
    <div className="min-w-0 space-y-3">
      <h2 className="text-xl font-medium leading-tight tracking-tight sm:text-2xl" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-[#6B6761] [&_a]:font-medium [&_a]:text-[#1C1C1C] [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-4">{children}</div>
    </div>
  </section>;
}
