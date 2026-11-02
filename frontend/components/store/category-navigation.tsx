"use client";
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CategoryOption, categoryGroups, categoryLabel } from '@/lib/catalog-presentation';
export function CategoryNavigation({ categories, selected, onSelect }: { categories: CategoryOption[]; selected: string; onSelect: (name: string) => void }) {
  const [expanded, setExpanded] = useState<number | null | undefined>(undefined);
  return <nav aria-label="Product categories" className="border-b border-border pb-4"><h3 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-widest">Categories</h3><button onClick={() => onSelect('All')} aria-pressed={selected === 'All'} className="min-h-10 w-full text-left text-sm hover:underline">All products</button><div className="max-h-64 overflow-y-auto overscroll-contain">{categoryGroups(categories).map(group => {
    const children = categories.filter(category => category.parent_id === group.id);
    const open = expanded === undefined ? children.some(child => child.name === selected) : expanded === group.id;
    return <div key={group.id}><div className="flex items-center gap-1"><button onClick={() => onSelect(group.name)} aria-pressed={selected === group.name} className={"min-h-10 flex-1 text-left text-sm " + (selected === group.name ? 'font-medium underline underline-offset-4' : 'text-muted-foreground hover:text-foreground')}>{categoryLabel(group.name)}</button>{children.length > 0 && <button aria-label={'Expand ' + categoryLabel(group.name)} aria-expanded={open} aria-controls={'category-' + group.id} onClick={() => setExpanded(open ? null : group.id)} className="flex h-10 w-10 items-center justify-center"><ChevronDown className={'h-3 w-3 transition-transform ' + (open ? 'rotate-180' : '')} /></button>}</div>{open && children.length > 0 && <div id={'category-' + group.id} className="mb-2 border-l border-border pl-4">{children.map(child => <button key={child.id} onClick={() => onSelect(child.name)} aria-pressed={selected === child.name} className="block min-h-9 w-full text-left text-xs text-muted-foreground hover:text-foreground">{categoryLabel(child.name)}</button>)}</div>}</div>;
  })}</div></nav>;
}
