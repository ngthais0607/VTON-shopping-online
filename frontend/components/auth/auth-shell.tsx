import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-[#FAF8F5] text-foreground">
    <header className="mx-auto flex w-full max-w-[1216px] items-center justify-between gap-4 px-6 py-5 sm:px-12">
      <Link href="/store" className="font-display text-[34px] font-normal leading-none tracking-[-0.035em]">TrueLook<span className="ml-1 align-top text-[11px] leading-5 text-[#B89B6A]">®</span></Link>
      <Link href="/store" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />Back to store</Link>
    </header>
    <main className="flex flex-1 items-center justify-center px-4 py-4 sm:px-8 lg:px-12 lg:py-6">{children}</main>
    <footer className="mx-auto flex w-full max-w-[1216px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[10px] leading-5 text-muted-foreground sm:px-12"><p>© {new Date().getFullYear()} TrueLook</p><p className="flex gap-6"><Link href="/store/privacy" className="hover:text-primary">Privacy</Link><Link href="/store/help" className="hover:text-primary">Help</Link></p></footer>
  </div>;
}
