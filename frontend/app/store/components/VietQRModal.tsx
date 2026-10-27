"use client";

import React, { useState } from "react";
import { X, Copy, Check, QrCode, ShieldCheck, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

import { VietQRData } from '@/lib/types';
export type { VietQRData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface VietQRModalProps {
  vietqrData: VietQRData;
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export function VietQRModal({
  vietqrData,
  isOpen,
  onClose,
  onContinue,
}: VietQRModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-xs">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight">VietQR Payment</h3>
                <p className="text-xs text-slate-500 mt-0.5">Scan QR code via Banking App</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 max-h-[80vh]">
            {/* QR Image Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center space-y-2">
              <div className="relative w-56 h-72 bg-white p-2 rounded-xl border border-slate-200 shadow-md overflow-hidden">
                <Image
                  src={vietqrData.qr_url}
                  alt="VietQR Payment Code"
                  fill
                  className="object-contain p-1"
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center font-medium">
                Supports VietQR Apps (MBBank, Vietcombank, Techcombank, MoMo, etc.)
              </p>
            </div>

            {/* Bank Transfer Details Table */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Transfer Details</h4>
              
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-3">
                {/* Bank */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Bank</span>
                  <span className="font-bold text-slate-900">{vietqrData.bank_name}</span>
                </div>

                {/* Account Number */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Account No.</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <span>{vietqrData.account_no}</span>
                    <button
                      onClick={() => copyToClipboard(vietqrData.account_no, "account_no")}
                      className="text-indigo-600 hover:text-indigo-800 p-0.5"
                      title="Copy Account Number"
                    >
                      {copiedField === "account_no" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Account Name */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Account Name</span>
                  <span className="font-bold text-slate-900 uppercase">{vietqrData.account_name}</span>
                </div>

                {/* Total Amount */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Total Amount</span>
                  <span className="font-extrabold text-indigo-600 text-sm">
                    {formatCurrency(vietqrData.amount, "VND")}
                  </span>
                </div>

                {/* Memo */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                  <span className="text-slate-500 font-medium">Payment Memo</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <span>{vietqrData.memo}</span>
                    <button
                      onClick={() => copyToClipboard(vietqrData.memo, "memo")}
                      className="text-amber-700 hover:text-amber-900 p-0.5"
                      title="Copy Payment Memo"
                    >
                      {copiedField === "memo" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation CTA */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={onContinue}
                className="w-full h-12 bg-primary hover:bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                <span>View Pending Orders</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <p className="text-[11px] text-slate-400 text-center">
                An administrator verifies the transfer before updating your order.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
