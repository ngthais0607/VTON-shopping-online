"use client";
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import type { Product } from '@/lib/types';
import { categoryLabel } from '@/lib/catalog-presentation';
import { getProductImageUrl } from '@/lib/placeholder-images';
import { formatCurrency } from '@/lib/utils';

export function ProductRail({ products }: { products: Product[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const advance = (direction: number) => {
    const node = rail.current;
    if (!node) return;
    const step = (node.firstElementChild?.getBoundingClientRect().width || node.clientWidth) + 24;
    const max = node.scrollWidth - node.clientWidth;
    const left = direction > 0 && node.scrollLeft >= max - 2 ? 0 : direction < 0 && node.scrollLeft <= 1 ? max : Math.max(0, Math.min(max, node.scrollLeft + direction * step));
    node.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  useEffect(() => {
    if (paused || interacting || products.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const node = rail.current;
      if (!node || node.scrollWidth <= node.clientWidth + 1) return;
      const step = (node.firstElementChild?.getBoundingClientRect().width || node.clientWidth) + 24;
      node.scrollTo({left: node.scrollLeft >= node.scrollWidth - node.clientWidth - 2 ? 0 : node.scrollLeft + step, behavior:'smooth'});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [paused, interacting, products.length]);
  if (!products.length) return null;
  return <section aria-label="Best sellers" className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-20 lg:pb-20">
    <div className="mb-7 flex items-end justify-between gap-4"><div><p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">The considered wardrobe</p><h2 className="font-display text-4xl font-normal">Best sellers</h2></div><div className="flex gap-2"><button aria-label={paused ? 'Play product carousel' : 'Pause product carousel'} onClick={() => setPaused(!paused)} className="flex h-11 w-11 items-center justify-center border border-border">{paused ? <Play size={15} /> : <Pause size={15} />}</button><button aria-label="Previous products" onClick={() => {setPaused(true); advance(-1);}} className="flex h-11 w-11 items-center justify-center border border-border"><ArrowLeft size={16} /></button><button aria-label="Next products" onClick={() => {setPaused(true); advance(1);}} className="flex h-11 w-11 items-center justify-center border border-border"><ArrowRight size={16} /></button></div></div>
    <div ref={rail} role="region" aria-label="Product carousel" tabIndex={0} onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false);}} onPointerDown={() => setPaused(true)} className="product-rail flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
      {products.slice(0,8).map(product => <Link key={product.id} href={'/store/products/' + (product.slug || product.id)} className="group w-[72%] shrink-0 snap-start sm:w-[43%] lg:w-[calc((100%_-_72px)/4)]"><div className="relative aspect-[4/5] overflow-hidden bg-secondary"><Image src={getProductImageUrl(product)} alt={product.name} fill sizes="(max-width:640px) 72vw, 25vw" className="object-cover" /></div><p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground">{categoryLabel(product.category?.name || 'TrueLook')}</p><h3 className="mt-2 text-base font-normal">{product.name}</h3><p className="mt-2 text-xs text-muted-foreground">{formatCurrency(product.price, product.currency)}</p></Link>)}
    </div><Link href="/store/collection" className="mt-5 inline-flex min-h-11 items-center gap-5 text-xs underline underline-offset-4">Explore the collection<ArrowRight size={14} /></Link>
  </section>;
}
