"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiGetBlob, apiUpload } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import type { VtonEligibility, VtonQuota, VtonTask } from "@/lib/types";
import {
  VTON_MAX_PHOTO_BYTES,
  VTON_POLL_INTERVAL_MS,
  VTON_POLL_TIMEOUT_MS,
  isVtonTerminal,
  newIdempotencyKey,
  vtonErrorMessage,
} from "@/lib/vton";

interface TryOnModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  variantId?: number;
  colorName?: string;
  eligibility: VtonEligibility;
}

type Phase = "form" | "working" | "done" | "failed";

export function TryOnModal({
  isOpen,
  onClose,
  productId,
  productName,
  variantId,
  colorName,
  eligibility,
}: TryOnModalProps) {
  const { user, isLoading: sessionLoading } = useSession();
  const [phase, setPhase] = useState<Phase>("form");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [task, setTask] = useState<VtonTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<VtonQuota | null>(null);
  const idempotencyKey = useRef<string>(newIdempotencyKey());
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const pollRef = useRef<((taskId: string, startedAt: number) => void) | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };

  const loadQuota = useCallback(async () => {
    try {
      setQuota(await apiGet<VtonQuota>("/vton/quota"));
    } catch {
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen && user) void loadQuota();
  }, [isOpen, user, loadQuota]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      stopPolling();
    };
  }, []);

  // Object URLs hold the (private) photo in memory: always revoke them.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const finish = useCallback(async (finished: VtonTask) => {
    setTask(finished);
    if (finished.status === "failed") {
      setError(vtonErrorMessage(finished.error_code));
      setPhase("failed");
      void loadQuota();
      return;
    }
    try {
      const blob = await apiGetBlob(`/vton/tasks/${finished.id}/result`);
      if (!cancelled.current) {
        setResultUrl(URL.createObjectURL(blob));
        setPhase("done");
      }
    } catch (err) {
      setError(vtonErrorMessage(err));
      setPhase("failed");
    }
    void loadQuota();
  }, [loadQuota]);

  const poll = useCallback(
    (taskId: string, startedAt: number) => {
      pollTimer.current = setTimeout(async () => {
        if (cancelled.current) return;
        try {
          const current = await apiGet<VtonTask>(`/vton/tasks/${taskId}`);
          setTask(current);
          if (isVtonTerminal(current.status)) {
            await finish(current);
            return;
          }
        } catch (err) {
          setError(vtonErrorMessage(err));
          setPhase("failed");
          return;
        }
        if (Date.now() - startedAt > VTON_POLL_TIMEOUT_MS) {
          setError(vtonErrorMessage("engine_timeout"));
          setPhase("failed");
          return;
        }
        pollRef.current?.(taskId, startedAt);
      }, VTON_POLL_INTERVAL_MS);
    },
    [finish],
  );

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const onPickFile = (picked: File | null) => {
    setError(null);
    if (picked && picked.size > VTON_MAX_PHOTO_BYTES) {
      setError(vtonErrorMessage("image_too_large"));
      return;
    }
    setFile(picked);
  };

  const submit = async () => {
    if (!file || !consent) return;
    setError(null);
    setPhase("working");
    const form = new FormData();
    form.append("person_image", file);
    form.append("product_id", String(productId));
    if (variantId) form.append("variant_id", String(variantId));
    form.append("consent", "true");
    try {
      const created = await apiUpload<VtonTask>("/vton/tasks", form, {
        "Idempotency-Key": idempotencyKey.current,
      });
      setTask(created);
      if (isVtonTerminal(created.status)) await finish(created);
      else poll(created.id, Date.now());
    } catch (err) {
      setError(vtonErrorMessage(err));
      setPhase("form");
      idempotencyKey.current = newIdempotencyKey();
    }
  };

  const reset = () => {
    stopPolling();
    setPhase("form");
    setError(null);
    setTask(null);
    setResultUrl(null);
    idempotencyKey.current = newIdempotencyKey();
  };

  const eraseData = async () => {
    if (!task) return;
    try {
      await apiDelete(`/vton/tasks/${task.id}`);
      toast.success("Your photo has been deleted.");
      setFile(null);
      setPreviewUrl(null);
      reset();
    } catch (err) {
      toast.error(vtonErrorMessage(err));
    }
  };

  const close = () => {
    stopPolling();
    onClose();
  };

  if (!isOpen) return null;

  const isDemo = eligibility.engine === "mock";
  const outOfQuota = quota !== null && quota.remaining <= 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Virtual try-on"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-600" />
          <h2 className="text-lg font-extrabold text-slate-900">Virtual try-on</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          {productName}
          {colorName ? <span className="text-slate-400"> · {colorName}</span> : null}
        </p>

        {isDemo && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Demo mode: the result is a simple overlay for illustration, not a real AI try-on. The image is
              stamped &quot;DEMO PREVIEW&quot;.
            </span>
          </div>
        )}

        {!sessionLoading && !user ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center">
            <p className="mb-4 text-sm text-slate-700">Sign in to use virtual try-on.</p>
            <Link
              href="/login"
              className="inline-block rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Sign in
            </Link>
          </div>
        ) : phase === "form" ? (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label
                htmlFor="vton-photo"
                className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500 hover:border-sky-400"
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Your photo" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span className="px-4">Choose your photo (PNG, JPEG or WebP, up to 5MB)</span>
                  </>
                )}
                <input
                  id="vton-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <ul className="space-y-2 text-xs text-slate-600">
                <li>• Portrait photo showing your upper body (full body for pants and skirts).</li>
                <li>• Stand straight, plain background, good lighting, nothing blocking your body.</li>
                <li>• Fitted or simple clothing gives more natural results.</li>
                <li>• Only upload photos of yourself.</li>
                {quota && (
                  <li className="pt-2 font-semibold text-slate-800">
                    {quota.remaining} of {quota.limit} try-ons left today.
                  </li>
                )}
              </ul>
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I agree to TrueLook processing this photo to create a try-on image. It is stored privately, only
                visible to me, and automatically deleted after {quota?.retention_hours ?? 24} hours (or immediately
                on request).
              </span>
            </label>

            {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!file || !consent || outOfQuota}
              className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-600 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {outOfQuota ? "No try-ons left today" : "Try it on"}
            </button>
          </div>
        ) : phase === "working" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            <p className="text-sm font-semibold text-slate-800">
              {task?.status === "processing" ? "Creating your try-on…" : "Waiting in queue…"}
            </p>
            <p className="text-xs text-slate-500">This can take from a few seconds to a few minutes.</p>
          </div>
        ) : phase === "done" ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {previewUrl && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Original photo" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                  <figcaption className="mt-1 text-center text-xs text-slate-500">Original</figcaption>
                </figure>
              )}
              {resultUrl && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultUrl} alt="Try-on result" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                  <figcaption className="mt-1 text-center text-xs text-slate-500">Result</figcaption>
                </figure>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Results are for reference only; fit and colour may differ from the real garment.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Try another photo
              </button>
              <button
                type="button"
                onClick={eraseData}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Trash2 className="h-4 w-4" /> Delete my photo
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
            <p role="alert" className="text-sm font-medium text-slate-800">{error}</p>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
