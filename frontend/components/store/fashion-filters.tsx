"use client";
import { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, X } from 'lucide-react';
import { swrFetcher } from '@/lib/swr-config';
import { updateCatalogQuery } from '@/lib/catalog-presentation';
import type { ProductFacetsResponse } from '@/lib/types';
interface FashionFiltersProps { isOpen?: boolean; onClose?: () => void; className?: string; hideStock?: boolean; }
function FilterSection({ title, selected, children }: { title: string; selected: string; children: ReactNode }) {
  return <details className="group border-b border-border"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-xs [&::-webkit-details-marker]:hidden"><span>{title}<span className="ml-2 text-[10px] text-muted-foreground">{selected || 'All'}</span></span><ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" /></summary><div className="max-h-48 overflow-y-auto overscroll-contain pb-4"><div className="flex flex-wrap gap-2">{children}</div></div></details>;
}
export function FashionFilters({ isOpen = true, onClose, className = '', hideStock = false }: FashionFiltersProps) {
  const router = useRouter(); const searchParams = useSearchParams();
  const { data: facets, error, isLoading, mutate } = useSWR<ProductFacetsResponse>('/products/facets', swrFetcher);
  const param = (key: string) => searchParams?.get?.(key) || '';
  const updateParam = (key: string, value: string | null) => router.replace(updateCatalogQuery(searchParams?.toString() || '', { [key]: value }), { scroll: false });
  const keys = ['category_id', 'gender', 'brand', 'size', 'color', 'stock_status', 'min_price', 'max_price'];
  const choice = (selected: boolean) => 'inline-flex min-h-9 min-w-9 items-center justify-center gap-2 border px-2.5 text-xs transition-colors ' + (selected ? 'border-foreground bg-foreground text-white' : 'border-border hover:bg-secondary');
  if (!isOpen) return null;
  return <div className={className} data-testid="fashion-filters-container">
    <div className="flex min-h-12 items-center justify-between gap-3"><h3 className="font-sans text-[11px] font-medium uppercase tracking-widest">Refine by</h3><div className="flex gap-3">{keys.some(key => Boolean(param(key))) && <button onClick={() => router.replace(updateCatalogQuery(searchParams?.toString() || '', Object.fromEntries(keys.map(key => [key, null]))), { scroll: false })} className="min-h-11 text-[11px] underline underline-offset-4">Clear all</button>}{onClose && <button onClick={onClose} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center"><X size={16} /></button>}</div></div>
    {isLoading && <p role="status" className="py-3 text-xs text-muted-foreground">Loading filters…</p>}
    {error && <div role="alert" className="py-3 text-xs text-destructive">Filters could not load. <button onClick={() => mutate()} className="underline">Retry filters</button></div>}
    {!!facets?.genders?.length && <FilterSection title="Gender" selected={param('gender')}>{facets.genders.map(gender => <button key={gender} aria-label={'Gender ' + gender} aria-pressed={param('gender') === gender} onClick={() => updateParam('gender', param('gender') === gender ? null : gender)} className={choice(param('gender') === gender)}>{({male:'Men',female:'Women',kids:'Kids',unisex:'Unisex'} as Record<string,string>)[gender] || gender}</button>)}</FilterSection>}
    {!!facets?.sizes?.length && <FilterSection title="Size" selected={param('size')}>{facets.sizes.map(size => <button key={size} aria-label={'Size ' + size} aria-pressed={param('size') === size} onClick={() => updateParam('size', param('size') === size ? null : size)} className={choice(param('size') === size)}>{size}</button>)}</FilterSection>}
    {!!facets?.colors?.length && <FilterSection title="Color" selected={param('color')}>{facets.colors.map(color => <button key={color.name} aria-label={'Color ' + color.name} aria-pressed={param('color') === color.name} onClick={() => updateParam('color', param('color') === color.name ? null : color.name)} className={choice(param('color') === color.name)}><span className="h-3 w-3 rounded-full border border-black/20" style={{backgroundColor:color.hex || '#999'}} />{color.name}</button>)}</FilterSection>}
    {!!facets?.brands?.length && <FilterSection title="Brand" selected={param('brand')}>{facets.brands.map(brand => <button key={brand} aria-label={'Brand ' + brand} aria-pressed={param('brand') === brand} onClick={() => updateParam('brand', param('brand') === brand ? null : brand)} className={choice(param('brand') === brand)}>{brand}</button>)}</FilterSection>}
    {!hideStock && <label className="mt-4 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={param('stock_status') === 'in_stock'} onChange={event => updateParam('stock_status', event.target.checked ? 'in_stock' : null)} />In stock only</label>}
  </div>;
}
