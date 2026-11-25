"use client";
import dynamic from "next/dynamic";
import type { UpperBodySceneProps } from "./UpperBodyScene";

const UpperBodyScene = dynamic(() => import("./UpperBodyScene"), {
  ssr: false,
  loading: () => (
    <div>
      <div className="flex aspect-[4/5] w-full items-center justify-center bg-[#DFE3D5] text-sm font-medium text-[#5E6557] sm:aspect-[5/4] lg:aspect-auto lg:h-[500px]">Loading 3D model…</div>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] animate-pulse bg-[#DFE3D5] sm:aspect-[7/6]" />)}</div>
    </div>
  ),
});

export function ViewerClient(props: UpperBodySceneProps) {
  return <UpperBodyScene {...props} />;
}
