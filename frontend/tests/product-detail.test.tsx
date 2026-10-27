import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProductDetailPage from "@/app/store/products/[slug]/page";
import type { Product } from "@/lib/types";

// Mock next/navigation
const mockBack = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
  useParams: () => ({
    slug: "ao-so-mi-oxford-premium",
  }),
}));

vi.mock("@/app/store/context/CartContext", () => ({
  useCart: () => ({
    addToCart: vi.fn(),
    cartItems: [],
    isCartOpen: false,
    setIsCartOpen: vi.fn(),
  }),
}));

// Mock apiGet
const mockProduct: Product = {
  id: 101,
  name: "Áo Sơ Mi Oxford Premium",
  slug: "ao-so-mi-oxford-premium",
  price: 350000,
  description: "Chất liệu cotton 100% thoáng mát, form dáng regular fit.",
  brand: "TrueLook",
  gender: "male",
  material: "100% Oxford Cotton",
  fit: "Regular Fit",
  care_instructions: "Giặt máy ở nhiệt độ dưới 40 độ C",
  stock_quantity: 15,
  reserved_quantity: 2,
  sold_quantity: 3,
  currency: "VND",
  is_active: true,
  created_at: null,
  updated_at: null,
  category: { id: 1, name: "Áo sơ mi", slug: "ao-so-mi" },
  images: [
    {
      id: "img-1",
      url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c",
      color_name: "Trắng",
      is_primary: true,
    },
    {
      id: "img-2",
      url: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10",
      color_name: "Xanh Navy",
      is_primary: false,
    },
  ],
  variants: [
    {
      id: 201,
      product_id: 101,
      sku: "OXFORD-WHITE-S",
      size: "S",
      color_name: "Trắng",
      color_hex: "#FFFFFF",
      price: 350000,
      stock_quantity: 5,
      reserved_quantity: 1,
      sold_quantity: 0,
      available_stock: 4,
      is_active: true,
    },
    {
      id: 202,
      product_id: 101,
      sku: "OXFORD-WHITE-M",
      size: "M",
      color_name: "Trắng",
      color_hex: "#FFFFFF",
      price: 350000,
      stock_quantity: 5,
      reserved_quantity: 5,
      sold_quantity: 0,
      available_stock: 0, // out of stock
      is_active: true,
    },
    {
      id: 203,
      product_id: 101,
      sku: "OXFORD-NAVY-M",
      size: "M",
      color_name: "Xanh Navy",
      color_hex: "#001F3F",
      price: 380000, // custom variant price
      stock_quantity: 5,
      reserved_quantity: 0,
      sold_quantity: 0,
      available_stock: 5,
      is_active: true,
    },
  ],
  review_summary: {
    average_rating: 4.8,
    total_reviews: 12,
    fit_breakdown: {
      small: 10,
      true_to_size: 80,
      large: 10,
      total_feedback: 10,
    },
    reviews: [],
  },
};

vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(async (url: string) => {
    if (url.includes("/reviews")) {
      return mockProduct.review_summary;
    }
    return mockProduct;
  }),
  apiPost: vi.fn(),
}));

describe("ProductDetailPage", () => {
  it("renders product title, brand, material and specifications", async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Áo Sơ Mi Oxford Premium" }),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText(/TrueLook/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/100% Oxford Cotton/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Regular Fit/i).length).toBeGreaterThanOrEqual(1);
  });

  it("handles color selection and disables out-of-stock sizes", async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /size m/i }),
      ).toBeInTheDocument();
    }, { timeout: 5000 });

    const sizeMButton = screen.getByRole("button", { name: /size m/i });
    expect(sizeMButton).toHaveAttribute("data-stock", "out_of_stock");

    // Click color Xanh Navy
    const navyColorBtn = screen.getByRole("button", { name: /xanh navy/i });
    fireEvent.click(navyColorBtn);

    // Size M in Navy has stock and price 380,000 VND
    await waitFor(() => {
      expect(screen.getByText(/380\.000/)).toBeInTheDocument();
    });
  });

  it("opens and closes SizeChartModal when clicking Size Guide", async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Bảng size/i)).toBeInTheDocument();
    });

    const sizeGuideBtn = screen.getByText(/Bảng size/i);
    fireEvent.click(sizeGuideBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Bảng thông số kích cỡ/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText("Đóng");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("renders review fit feedback breakdown", async () => {
    render(<ProductDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/80%/)).toBeInTheDocument();
      expect(screen.getByText(/Chuẩn size/i)).toBeInTheDocument();
    });
  });
});
