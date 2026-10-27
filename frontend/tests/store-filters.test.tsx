import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FashionFilters } from "@/components/store/fashion-filters";
import type { ProductFacetsResponse } from "@/lib/types";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

const mockFacets: ProductFacetsResponse = {
  genders: ["male", "female", "unisex"],
  brands: ["TrueLook", "Nike"],
  sizes: ["S", "M", "L", "XL"],
  colors: [
    { name: "Trắng", hex: "#FFFFFF" },
    { name: "Đen", hex: "#000000" },
  ],
  categories: [{ id: 1, name: "Áo", slug: "ao" }],
  price_min: 100000,
  price_max: 900000,
};

vi.mock("swr", () => ({
  default: () => ({
    data: mockFacets,
    error: undefined,
  }),
}));

describe("FashionFilters", () => {
  it("renders facet options for gender, size, color, brand", () => {
    mockSearchParams = new URLSearchParams();
    render(<FashionFilters />);

    expect(screen.getByText("Bộ lọc thời trang")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /giới tính nam/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /size m/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /màu đen/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thương hiệu truelook/i })).toBeInTheDocument();
  });

  it("updates URL query string when clicking a facet button", () => {
    mockSearchParams = new URLSearchParams();
    render(<FashionFilters />);

    const maleBtn = screen.getByRole("button", { name: /giới tính nam/i });
    fireEvent.click(maleBtn);

    expect(mockReplace).toHaveBeenCalledWith("?gender=male", { scroll: false });
  });

  it("toggles in_stock parameter on stock status checkbox change", () => {
    mockSearchParams = new URLSearchParams();
    render(<FashionFilters />);

    const stockCheckbox = screen.getByRole("checkbox");
    fireEvent.click(stockCheckbox);

    expect(mockReplace).toHaveBeenCalledWith("?stock_status=in_stock", { scroll: false });
  });

  it("resets all active filters when clicking Đặt lại", () => {
    mockSearchParams = new URLSearchParams("gender=male&size=M&brand=TrueLook");
    render(<FashionFilters />);

    const resetBtn = screen.getByText(/Đặt lại/i);
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(mockReplace).toHaveBeenCalledWith("?", { scroll: false });
  });
});
