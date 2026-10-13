import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VariantMatrixGenerator } from "@/components/admin/variant-matrix-generator";
import { VariantStockDialog } from "@/components/admin/variant-stock-dialog";
import type { ProductVariant } from "@/lib/types";

describe("VariantMatrixGenerator", () => {
  it("renders size presets (Apparel, Shoes, ONE_SIZE) and default colors", () => {
    const handleGenerate = vi.fn();
    render(<VariantMatrixGenerator productId={1} onGenerate={handleGenerate} />);

    expect(screen.getByText("Tạo biến thể hàng loạt (Variant Matrix)")).toBeInTheDocument();
    expect(screen.getByText("Quần áo (XS - XXL)")).toBeInTheDocument();
    expect(screen.getByText("Giày dép (36 - 45)")).toBeInTheDocument();
    expect(screen.getByText("Freesize (ONE_SIZE)")).toBeInTheDocument();
  });

  it("selects apparel preset and generates combinations", () => {
    const handleGenerate = vi.fn();
    render(<VariantMatrixGenerator productId={1} onGenerate={handleGenerate} />);

    // Click Apparel preset button
    const apparelBtn = screen.getByRole("button", { name: /Quần áo \(XS - XXL\)/i });
    fireEvent.click(apparelBtn);

    // Verify sizes are selected
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();

    // Add a color
    const colorNameInput = screen.getByPlaceholderText(/Tên màu/i);
    fireEvent.change(colorNameInput, { target: { value: "Đen" } });
    const addColorBtn = screen.getByRole("button", { name: /Thêm màu/i });
    fireEvent.click(addColorBtn);

    // Click Generate button
    const generateBtn = screen.getByRole("button", { name: /Tạo ma trận biến thể/i });
    fireEvent.click(generateBtn);

    expect(handleGenerate).toHaveBeenCalledTimes(1);
    const payload = handleGenerate.mock.calls[0][0];
    expect(payload.sizes).toContain("M");
    expect(payload.colors.some((c: any) => c.name === "Đen")).toBe(true);
    expect(payload.variants.length).toBeGreaterThan(0);
  });
});

describe("VariantStockDialog", () => {
  const mockVariant: ProductVariant = {
    id: 101,
    product_id: 1,
    sku: "TL-AO-DEN-M",
    size: "M",
    color_name: "Đen",
    color_hex: "#000000",
    price: 250000,
    stock_quantity: 10,
    reserved_quantity: 2,
    sold_quantity: 1,
    available_stock: 7,
    is_active: true,
  };

  it("renders current variant info and requires reason for adjustment", async () => {
    const handleSubmit = vi.fn();
    render(
      <VariantStockDialog
        variant={mockVariant}
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText(/Điều chỉnh tồn kho biến thể/i)).toBeInTheDocument();
    expect(screen.getByText(/TL-AO-DEN-M/i)).toBeInTheDocument();

    const stockInput = screen.getByLabelText(/Tồn kho mới/i);
    fireEvent.change(stockInput, { target: { value: "20" } });

    // Try submit without reason
    const submitBtn = screen.getByRole("button", { name: /Xác nhận điều chỉnh/i });
    fireEvent.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();

    // Enter reason and submit
    const reasonInput = screen.getByLabelText(/Lý do điều chỉnh/i);
    fireEvent.change(reasonInput, { target: { value: "Nhập thêm hàng từ kho tổng" } });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith({
      stock_quantity: 20,
      reason: "Nhập thêm hàng từ kho tổng",
    });
  });
});
