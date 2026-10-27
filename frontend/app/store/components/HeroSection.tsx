"use client";
import { ArrowRight } from "lucide-react";

export function HeroSection({ onShopNow }: { onShopNow: () => void }) {
  return (
    <section className="bg-sky-50 pt-36 pb-20 px-6">
      <div className="max-w-7xl mx-auto">
        <p className="text-sky-700 text-sm font-semibold">TRUELOOK · THỜI TRANG</p>
        <h1 className="mt-5 text-4xl md:text-6xl font-bold text-slate-900 max-w-3xl">Quần áo cho phong cách mỗi ngày.</h1>
        <p className="mt-6 text-slate-600 max-w-xl leading-relaxed">Khám phá áo, quần, váy đầm và áo khoác. Chọn kích cỡ, màu sắc và xem tồn kho trước khi đặt hàng.</p>
        <button onClick={onShopNow} className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 bg-sky-600 text-white font-semibold hover:bg-sky-700">Xem bộ sưu tập <ArrowRight className="w-4 h-4" /></button>
        <p className="mt-5 text-xs text-slate-500">Bản demo cửa hàng · Chưa xử lý giao hàng thực tế</p>
      </div>
    </section>
  );
}
