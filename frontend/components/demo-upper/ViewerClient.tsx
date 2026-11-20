"use client";
import dynamic from "next/dynamic";
import type { UpperBodySceneProps } from "./UpperBodyScene";

const UpperBodyScene = dynamic(() => import("./UpperBodyScene"), {
  ssr: false,
  loading: () => (
    <div>
      <div className="flex aspect-[4/5] w-full items-center justify-center border border-[#E8E3DB] bg-[#E7E7EB] text-xs uppercase tracking-[0.2em] text-[#6B6761] sm:aspect-[5/4] lg:aspect-auto lg:h-[560px]">Loading 3D model…</div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] animate-pulse border border-[#E8E3DB] bg-[#E7E7EB]" />)}</div>
    </div>
  ),
});

export function ViewerClient(props: UpperBodySceneProps) {
  return <UpperBodyScene {...props} />;
}
