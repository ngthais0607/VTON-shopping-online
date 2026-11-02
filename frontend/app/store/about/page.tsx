import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Our story | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Our story" title="Style starts with you." description="TrueLook is a fashion store demo: a space to explore clothing, choose variants, and experience the shopping journey.">
      <div className="border border-[#E8E3DB] bg-[#F1ECE4] p-7 sm:p-10">
        <p className="mb-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">The everyday edit</p>
        <p className="max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>Less complexity.<br />More room for individuality.</p>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[#6B6761]">An experience built around clothing, clear information, and your own choices.</p>
      </div>
      <ContentSection number="01" title="Explore your way"><p>Filter the collection, view product details, and choose your size and color before adding an item to your bag.</p></ContentSection>
      <ContentSection number="02" title="Follow every step"><p>Orders, payment methods, and processing status appear in your <Link href="/store/orders">order history</Link> and individual tracking pages.</p></ContentSection>
      <ContentSection number="03" title="A transparent experience"><p>This is a demo environment. Product information and order status come from demo data; delivery and live support are not provided.</p></ContentSection>
    </ContentPage>
  );
}
