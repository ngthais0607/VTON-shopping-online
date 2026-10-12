'use client';
export function PaginationControls({page, pageSize, total, onPageChange, disabled}: {
  page:number; pageSize:number; total:number; onPageChange:(page:number)=>void; disabled?:boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Pagination" className="flex items-center gap-4 py-4">
    <button disabled={disabled || page <= 1} onClick={()=>onPageChange(page-1)}>Previous</button>
    <span>Page {page} of {pages} · {total} records</span>
    <button disabled={disabled || page >= pages} onClick={()=>onPageChange(page+1)}>Next</button>
  </nav>;
}
