import type { Metadata } from "next";
import { StoreLayoutClient } from "./store-layout-client";

export const metadata: Metadata = {
  title: "TrueLook",
  description: "Khám phá danh sách sản phẩm thời trang và phụ kiện cao cấp tại TrueLook.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StoreLayoutClient>{children}</StoreLayoutClient>;
}
