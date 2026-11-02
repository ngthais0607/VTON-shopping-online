"use client";
import { useState } from "react";
import { Copy, Check, ArrowRight } from "lucide-react";
import Image from "next/image";
import { StoreDialog } from "@/components/store/store-dialog";
import type { VietQRData } from "@/lib/types";
export type { VietQRData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
interface VietQRModalProps { vietqrData: VietQRData; isOpen: boolean; onClose: () => void; onContinue: () => void; }
export function VietQRModal({ vietqrData, isOpen, onClose, onContinue }: VietQRModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copy = async (value: string, field: string) => {
    try { await navigator.clipboard.writeText(value); setCopiedField(field); setCopyError(null); }
    catch { setCopyError("Unable to copy. Please select and copy the details manually."); }
  };
  return <StoreDialog open={isOpen} onClose={onClose} title="VietQR payment" description="Transfer details for your order awaiting confirmation.">
    <div className="min-h-0 space-y-6 overflow-y-auto p-5 sm:p-6">
      <div className="border border-border bg-secondary/50 p-4 text-center"><p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">PAYMENT QR CODE · DEMO</p><div className="relative mx-auto h-64 w-52 bg-white"><Image src={vietqrData.qr_url} alt="VietQR Payment Code" fill sizes="208px" className="object-contain p-2" /></div></div>
      <dl className="divide-y divide-border text-sm">
        <div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-muted-foreground">Bank</dt><dd className="font-medium">{vietqrData.bank_name}</dd></div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-muted-foreground">Account number</dt><dd className="flex min-w-0 items-center gap-2 font-mono"><span className="break-all select-all">{vietqrData.account_no}</span><button aria-label="Copy Account Number" onClick={() => copy(vietqrData.account_no, "account")} className="flex h-11 w-11 shrink-0 items-center justify-center border border-border hover:bg-secondary">{copiedField === "account" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}</button></dd></div>
        <div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-muted-foreground">Account holder</dt><dd className="font-medium">{vietqrData.account_name}</dd></div>
        <div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-muted-foreground">Amount</dt><dd className="text-xl font-semibold text-primary">{formatCurrency(vietqrData.amount, "VND")}</dd></div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-muted-foreground">Payment memo</dt><dd className="flex min-w-0 items-center gap-2 font-mono"><span className="break-all select-all">{vietqrData.memo}</span><button aria-label="Copy Payment Memo" onClick={() => copy(vietqrData.memo, "memo")} className="flex h-11 w-11 shrink-0 items-center justify-center border border-border hover:bg-secondary">{copiedField === "memo" ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}</button></dd></div>
      </dl>
      {copiedField && <p role="status" className="text-xs text-primary">Copied {copiedField === "account" ? "account number" : "payment memo"}.</p>}{copyError && <p role="alert" className="text-xs text-destructive">{copyError}</p>}
      <div><button onClick={onContinue} aria-label="View Pending Orders" className="flex min-h-12 w-full items-center justify-between bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-foreground">View pending orders <ArrowRight className="h-4 w-4" /></button>
        {/* An administrator verifies the transfer before updating the order. */}
        <p className="mt-3 text-center text-xs leading-6 text-muted-foreground">An administrator verifies the transfer before updating its status. Open your order to check confirmation.</p>
      </div>
    </div>
  </StoreDialog>;
}
