import type { Metadata } from "next";
import { StoreLayoutClient } from "./store-layout-client";

export const metadata: Metadata = {
  title: "LuxeStore",
  description: "Khám phá danh sách sản phẩm thời trang và phụ kiện cao cấp tại LuxeStore.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StoreLayoutClient>{children}</StoreLayoutClient>;
}
