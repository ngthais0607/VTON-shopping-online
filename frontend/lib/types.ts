export interface Product {
  id: number;
  name: string;
  price: number;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  currency: string;
  is_active: boolean;
  category: { id: number; name: string } | null;
  images: ProductImage[];
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
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  deleted_by: number | null;
}

export type OrderStatus = "pending" | "confirmed" | "paid" | "cancelled" | "expired";
export type OrderPaymentMethod = "vietqr" | "cod";

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  public_code?: string;
  user_id: number | null;
  product_id?: number;
  product_name?: string;
  unit_price?: number;
  quantity?: number;
  total: number;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  payment_method: OrderPaymentMethod;
  payment_status: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  notes: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  items?: OrderItem[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface ProductImage { id: string; url: string }
export interface TokenPair { access_token: string; refresh_token?: string; token_type: string }
export interface ReviewResponse {
  id: number; product_id: number; user_id: number; user_name: string; rating: number;
  title: string | null; comment: string | null; is_verified_purchase: boolean; created_at: string | null;
}
export interface ReviewSummary { average_rating: number | null; total_reviews: number; reviews: ReviewResponse[] }
export interface CheckoutCommand {
  items: { product_id: number; quantity: number }[]; customer_name: string; customer_phone: string;
  shipping_address: string; notes?: string | null; payment_method: OrderPaymentMethod;
}
export interface VietQRData {
  qr_url: string; bank_id: string; bank_name: string; account_no: string;
  account_name: string; memo: string; amount: number;
}
export interface CheckoutResponse {
  message: string; orders: Order[]; total_amount: number; payment_method: OrderPaymentMethod; vietqr?: VietQRData | null;
}
export interface TrackingResponse extends Order {
  timeline: { step: number; title: string; description: string; completed: boolean; timestamp: string | null }[];
  vietqr?: VietQRData | null;
}
export interface DashboardMetrics {
  total_products: number; active_products: number; low_stock: number; pending_orders: number; revenue: number;
}
export type RecentOrderSummary = Pick<Order, 'id' | 'product_name' | 'quantity' | 'total' | 'currency' | 'status' | 'payment_status' | 'created_at'>;
export interface LowStockProductSummary {
  id: number; name: string; stock_quantity: number; reserved_quantity: number; sold_quantity: number;
  available_stock: number; category: { id: number; name: string } | null;
}
