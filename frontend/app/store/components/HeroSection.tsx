"use client";
import Image from "next/image";
import Link from "next/link";
export function HeroSection() {
  return <section className="relative mt-16 h-[calc(100svh-4rem)] min-h-[540px] max-h-[680px] overflow-hidden bg-[#E7E0D6] lg:mt-[106px] lg:h-[calc(100svh-106px)] lg:min-h-[520px] lg:max-h-[760px]" aria-label="The art of everyday dressing">
    <Image src="/images/luxury-campaign.webp" alt="A quiet moment in the TrueLook collection, against sunlit stone" fill priority sizes="100vw" className="object-cover" style={{ objectPosition: "63% 4%" }}/>
    <div className="absolute inset-0 bg-gradient-to-r from-[#F1ECE4]/90 via-[#F1ECE4]/35 to-transparent lg:from-[#F1ECE4]/45 lg:via-transparent"/>
    <div className="relative mx-auto flex h-full max-w-[1440px] items-center px-6 lg:px-20"><div className="max-w-[540px] pb-6"><p className="mb-6 text-[10px] uppercase tracking-[0.25em] text-[#6B6761]">A study in quiet elegance</p><h1 className="text-[61px] leading-[0.96] tracking-[-0.035em] text-[#1C1C1C] sm:text-[76px] lg:text-[88px]" style={{fontFamily:"var(--font-display)"}}>The art of<br/><em className="font-normal">everyday</em><br/>dressing.</h1><p className="mt-6 max-w-[280px] text-[12px] leading-6 text-[#6B6761] sm:max-w-[330px]">Considered silhouettes. Natural textures.<br/>A wardrobe that feels entirely your own.</p><Link href="/store/collection" className="mt-8 inline-flex min-h-12 items-center justify-center bg-[#1C1C1C] px-7 text-[10px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#4E4941]">Shop the Collection</Link></div></div>
    <div className="absolute bottom-6 left-6 flex gap-2 lg:left-20" aria-label="Campaign"><span className="h-px w-8 bg-[#1C1C1C]"/><span className="h-px w-8 bg-[#1C1C1C]/25"/><span className="h-px w-8 bg-[#1C1C1C]/25"/></div>
    <p className="absolute bottom-5 right-6 text-[9px] uppercase tracking-[0.2em] text-[#6B6761] lg:right-20">The TrueLook Edit / 01</p>
  </section>;
}
