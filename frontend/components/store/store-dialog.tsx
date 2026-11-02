"use client";
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function StoreDialog({ open, onClose, title, description, children, drawer = false, wide = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; drawer?: boolean; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-[#242720]/40 backdrop-blur-[2px]" />
    <Dialog.Content className={drawer ? "fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl" : "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col border border-border bg-background shadow-xl " + (wide ? "max-w-3xl" : "max-w-lg")}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6"><div><Dialog.Title className="pr-3 text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{title}</Dialog.Title><Dialog.Description className={description ? "mt-2 text-xs leading-5 text-muted-foreground" : "sr-only"}>{description || "View details and available options."}</Dialog.Description></div><Dialog.Close aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-secondary"><X className="h-5 w-5" /></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
