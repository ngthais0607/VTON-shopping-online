"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { swrFetcher } from "@/lib/swr-config";
import type { Product, CartItemV2, VariantLookupItem } from "@/lib/types";
import { getAvailableStock } from "@/lib/inventory";

export interface CartItem {
  variantId: number;
  productId: number;
  quantity: number;
  variant?: VariantLookupItem;
  product: Product;
}

interface CartContextType {
  isLoaded: boolean;
  cartItems: CartItem[];
  addToCart: (
    productOrItem: Product | CartItemV2 | any,
    quantity?: number,
    variantId?: number
  ) => void;
  removeFromCart: (variantId: number) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  clearCart: () => void;
  totalAmount: number;
  totalCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CART_STORAGE_KEY_V2 = "truelook_cart_v2";

function restoreCartV2(value: unknown): CartItemV2[] {
  if (!Array.isArray(value)) return [];
  const items: CartItemV2[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const vId = (item as any).variantId;
    const pId = (item as any).productId;
    const qty = (item as any).quantity;

    if (
      Number.isInteger(vId) &&
      vId > 0 &&
      Number.isInteger(pId) &&
      pId > 0 &&
      Number.isInteger(qty) &&
      qty > 0
    ) {
      const existing = items.find((i) => i.variantId === vId);
      if (existing) {
        existing.quantity += qty;
      } else {
        items.push({ variantId: vId, productId: pId, quantity: qty });
      }
    }
  }
  return items;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [rawItems, setRawItems] = useState<CartItemV2[]>([]);
  const [productCache, setProductCache] = useState<Map<number, Product>>(new Map());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart on mount: check truelook_cart_v2; clear and notify if legacy key exists
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("fastapi_store_cart")) {
        localStorage.removeItem("fastapi_store_cart");
        toast.info("Giỏ hàng cũ đã được làm mới theo hệ thống phiên bản mới.");
      }
      const savedV2 = localStorage.getItem(CART_STORAGE_KEY_V2);
      if (savedV2) {
        setRawItems(restoreCartV2(JSON.parse(savedV2)));
      }
    } catch (e) {
      console.error("Failed to load cart from localStorage", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save cart to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(CART_STORAGE_KEY_V2, JSON.stringify(rawItems));
      } catch (e) {
        console.error("Failed to save cart to localStorage", e);
      }
    }
  }, [rawItems, isLoaded]);

  // SWR Live lookup for variant metadata (price, stock, sku, size, color)
  const variantIds = useMemo(
    () => rawItems.map((i) => i.variantId).filter((id) => Number.isInteger(id) && id > 0),
    [rawItems]
  );

  const lookupKey =
    variantIds.length > 0
      ? `/products/variants/lookup?ids=${variantIds.slice(0, 50).join(",")}`
      : null;

  const { data: liveVariants } = useSWR<VariantLookupItem[]>(lookupKey, swrFetcher);

  const variantMap = useMemo(() => {
    const map = new Map<number, VariantLookupItem>();
    if (liveVariants && Array.isArray(liveVariants)) {
      for (const v of liveVariants) {
        map.set(v.id, v);
      }
    }
    return map;
  }, [liveVariants]);

  // Combine raw items with live metadata & fallback product cache
  const cartItems: CartItem[] = useMemo(() => {
    return rawItems.map((raw) => {
      const v = variantMap.get(raw.variantId);
      const cached = productCache.get(raw.productId);

      const price = v ? v.price : cached ? cached.price : 0;
      const name = v ? v.product_name : cached ? cached.name : "Sản phẩm";
      let maxStock = 999;
      if (v) {
        maxStock = v.available_stock;
      } else if (cached?.variants && cached.variants.length > 0) {
        const matchingVariant = cached.variants.find((item: any) => item.id === raw.variantId);
        if (matchingVariant && matchingVariant.stock_quantity !== undefined) {
          maxStock = getAvailableStock(matchingVariant);
        }
      } else if (cached && cached.stock_quantity !== undefined) {
        maxStock = getAvailableStock(cached);
      }

      const effectiveQty = Math.min(raw.quantity, Math.max(1, maxStock));

      const synthesizedProduct: Product = cached
        ? { ...cached, price }
        : {
            id: raw.productId,
            name,
            price,
            currency: "USD",
            description: "",
            is_active: v ? v.is_active : true,
            stock_quantity: v ? v.stock_quantity : maxStock,
            reserved_quantity: v ? v.reserved_quantity : 0,
            sold_quantity: v ? v.sold_quantity : 0,
            created_at: null,
            updated_at: null,
            category: null,
            images: v?.image_url ? [{ id: "img-1", url: v.image_url }] : [],
            image_url: v?.image_url || undefined,
          };

      return {
        variantId: raw.variantId,
        productId: raw.productId,
        quantity: effectiveQty,
        variant: v,
        product: synthesizedProduct,
      };
    });
  }, [rawItems, variantMap, productCache]);

  const addToCart = (
    productOrItem: any,
    quantity: number = 1,
    explicitVariantId?: number
  ) => {
    if (!Number.isInteger(quantity) || quantity <= 0) return;

    let variantId = explicitVariantId;
    let productId = productOrItem?.id ?? productOrItem?.productId;

    if (typeof productOrItem === "object" && productOrItem !== null) {
      if (productOrItem.is_active === false) return; // ignore inactive

      if ("variantId" in productOrItem && productOrItem.variantId) {
        variantId = productOrItem.variantId;
        productId = productOrItem.productId;
      } else if (
        !variantId &&
        Array.isArray(productOrItem.variants) &&
        productOrItem.variants.length > 0
      ) {
        const activeVariants = productOrItem.variants.filter((v: any) => v.is_active !== false);
        if (activeVariants.length === 1) {
          variantId = activeVariants[0].id;
        } else if (activeVariants.length > 1) {
          // Multi-variant product: redirect to detail page if slug available
          if (typeof window !== "undefined" && productOrItem.slug) {
            window.location.href = `/store/products/${productOrItem.slug}`;
            return;
          }
        }
      }
    }

    if (!variantId || !productId) return;

    // Cache product object if passed
    if (productOrItem && typeof productOrItem === "object" && "name" in productOrItem) {
      setProductCache((prev) => new Map(prev).set(productId, productOrItem));
      if (
        (!productOrItem.variants || productOrItem.variants.length === 0) &&
        productOrItem.stock_quantity !== undefined &&
        getAvailableStock(productOrItem) <= 0
      ) {
        return;
      }
    }

    setRawItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.variantId === variantId);
      const v = variantMap.get(variantId!);
      const cached =
        productOrItem && typeof productOrItem === "object" && "name" in productOrItem
          ? productOrItem
          : productCache.get(productId);

      let maxStock = 999;
      if (v) {
        maxStock = v.available_stock;
      } else if (cached?.variants && cached.variants.length > 0) {
        const matchingVariant = cached.variants.find((item: any) => item.id === variantId);
        if (matchingVariant && matchingVariant.stock_quantity !== undefined) {
          maxStock = getAvailableStock(matchingVariant);
        }
      } else if (cached && cached.stock_quantity !== undefined) {
        maxStock = getAvailableStock(cached);
      }

      if (existingIndex > -1) {
        const updated = [...prev];
        const newQty = Math.min(updated[existingIndex].quantity + quantity, maxStock);
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      }

      const initialQty = Math.min(quantity, maxStock);
      return [...prev, { variantId: variantId!, productId, quantity: initialQty }];
    });

    setIsCartOpen(true);
  };

  const removeFromCart = (variantId: number) => {
    setRawItems((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const updateQuantity = (variantId: number, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setRawItems((prev) =>
      prev.map((item) => {
        if (item.variantId === variantId) {
          const v = variantMap.get(item.variantId);
          const cached = productCache.get(item.productId);
          let maxStock = 999;
          if (v) {
            maxStock = v.available_stock;
          } else if (cached?.variants && cached.variants.length > 0) {
            const matchingVariant = cached.variants.find((vr: any) => vr.id === item.variantId);
            if (matchingVariant && matchingVariant.stock_quantity !== undefined) {
              maxStock = getAvailableStock(matchingVariant);
            }
          } else if (cached && cached.stock_quantity !== undefined) {
            maxStock = getAvailableStock(cached);
          }
          return { ...item, quantity: Math.min(quantity, maxStock) };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setRawItems([]);
    try {
      localStorage.setItem(CART_STORAGE_KEY_V2, "[]");
    } catch {}
  };

  const totalAmount = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const price = item.variant?.price ?? item.product?.price ?? 0;
      return sum + price * item.quantity;
    }, 0);
  }, [cartItems]);

  const totalCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems]);

  return (
    <CartContext.Provider
      value={{
        isLoaded,
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalAmount,
        totalCount,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
