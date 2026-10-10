export interface Product {
  id: number;
  name: string;
  price: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  currency: string;
  is_active: boolean;
  category: { id: number; name: string } | null;
  images: { id: string; object_name: string; url: string }[];
  image_url?: string;
}

export interface ProductFormData {
  name: string;
  price: number;
  description?: string | null;
  category_id?: number | null;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  currency: string;
  is_active: boolean;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  product_count: number;
}

export type OrderStatus = "pending" | "confirmed" | "paid" | "cancelled" | "expired";
export type OrderPaymentMethod = "vietqr" | "cod";

export interface Order {
  id: number;
  user_id?: number;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  total_amount?: number;
  status: OrderStatus;
  payment_method: OrderPaymentMethod;
  payment_status: 'pending' | 'paid' | 'failed';
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  notes?: string | null;
  expires_at?: string;
  paid_at?: string;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: 'admin' | 'customer';
  created_at: string;
}
