'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function PaginationControls({page, pageSize, total, onPageChange, disabled}: {
  page:number; pageSize:number; total:number; onPageChange:(page:number)=>void; disabled?:boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-muted-foreground">
    <span aria-live="polite">Page <span className="font-semibold text-foreground">{page}</span> of {pages} <span className="mx-1">·</span> {total} records</span>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={()=>onPageChange(page-1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" />Previous</Button>
      <Button variant="outline" size="sm" disabled={disabled || page >= pages} onClick={()=>onPageChange(page+1)}>Next<ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
    </div>
  </nav>;
}
