export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string | null;
  price: number | null;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  available_stock: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  color_name?: string | null;
  kind?: "front" | "back" | "detail" | "model" | "flatlay" | string;
  is_primary?: boolean;
  sort_order?: number;
}

export interface Product {
  id: number;
  name: string;
  slug?: string;
  price: number;
  description: string | null;
  brand?: string | null;
  gender?: "male" | "female" | "unisex" | "kids" | string;
  material?: string | null;
  fit?: string | null;
  care_instructions?: string | null;
  size_chart?: Record<string, Record<string, string | number>> | null;
  created_at: string | null;
  updated_at: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  currency: string;
  is_active: boolean;
  category: { id: number; name: string; slug?: string } | null;
  images: ProductImage[];
  image_url?: string;
  variants?: ProductVariant[];
  price_min?: number;
  price_max?: number;
  available_sizes?: string[];
  available_colors?: string[];
  review_summary?: ReviewSummary | null;
  rating_avg?: number | null;
  review_count?: number;
}

export interface ProductFormData {
  name: string;
  price: number;
  description?: string | null;
  category_id?: number | null;
  stock_quantity?: number;
  reserved_quantity?: number;
  sold_quantity?: number;
  currency: string;
  is_active: boolean;
  brand?: string | null;
  gender?: string;
  material?: string | null;
  fit?: string | null;
  care_instructions?: string | null;
  size_chart?: Record<string, Record<string, string | number>> | null;
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
  description: string | null;
  parent_id?: number | null;
  parent?: { id: number; name: string; slug?: string } | null;
  children?: { id: number; name: string; slug?: string }[];
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
  variant_id?: number | null;
  sku?: string | null;
  size?: string | null;
  color_name?: string | null;
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

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface TokenPair {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export type FitFeedbackType = "small" | "true_to_size" | "large";

export interface FitFeedbackSummary {
  small: number;
  true_to_size: number;
  large: number;
  total_feedback: number;
}

export interface ReviewResponse {
  id: number;
  product_id: number;
  user_id: number;
  user_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  fit_feedback?: FitFeedbackType | null;
  is_verified_purchase: boolean;
  created_at: string | null;
}

export interface ReviewAggregateSummary {
  average_rating: number | null;
  total_reviews: number;
  fit_feedback?: FitFeedbackSummary | null;
}

export interface ReviewPage {
  items?: ReviewResponse[];
  total?: number;
  limit?: number;
  offset?: number;
  summary?: ReviewAggregateSummary;
  average_rating?: number | null;
  total_reviews?: number;
  fit_feedback?: FitFeedbackSummary | null;
  fit_breakdown?: FitFeedbackSummary | null;
  reviews?: ReviewResponse[];
}

export type ReviewSummary = ReviewPage;

export interface CartItemV2 {
  variantId: number;
  productId: number;
  quantity: number;
}

export interface CheckoutCommand {
  items: { variant_id: number; quantity: number }[];
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  notes?: string | null;
  payment_method: OrderPaymentMethod;
}

export interface VietQRData {
  qr_url: string;
  bank_id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  memo: string;
  amount: number;
}

export interface CheckoutResponse {
  message: string;
  orders: Order[];
  total_amount: number;
  payment_method: OrderPaymentMethod;
  vietqr?: VietQRData | null;
}

export interface PublicTrackingItem {
  product_name: string;
  size?: string | null;
  color_name?: string | null;
  quantity: number;
  unit_price?: number | null;
  subtotal?: number | null;
  sku?: string | null;
}

export interface PublicTrackingResponse {
  public_code: string;
  status: OrderStatus;
  payment_status: string;
  payment_method: OrderPaymentMethod;
  total_amount: number;
  currency: string;
  created_at?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  timeline: {
    step: number;
    title: string;
    description: string;
    completed: boolean;
    timestamp: string | null;
  }[];
  items: PublicTrackingItem[];
  vietqr?: VietQRData | null;
  customer_name: string;
  customer_phone: string;
  id?: number | string;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
}

export type TrackingResponse = PublicTrackingResponse;

export interface DashboardMetrics {
  total_products: number;
  active_products: number;
  low_stock: number;
  pending_orders: number;
  revenue: number;
}

export type RecentOrderSummary = Pick<
  Order,
  | "id"
  | "product_name"
  | "quantity"
  | "total"
  | "currency"
  | "status"
  | "payment_status"
  | "created_at"
>;

export interface LowStockProductSummary {
  id: number;
  name: string;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  available_stock: number;
  category: { id: number; name: string } | null;
}

export interface FacetColor {
  name: string;
  hex: string | null;
}

export interface ProductFacetsResponse {
  genders: string[];
  brands: string[];
  sizes: string[];
  colors: FacetColor[];
  categories: { id: number; name: string; slug?: string }[];
  price_min: number;
  price_max: number;
}

export interface VariantLookupItem {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  sku: string;
  size: string;
  color_name: string;
  color_hex: string | null;
  price: number;
  stock_quantity: number;
  reserved_quantity: number;
  sold_quantity: number;
  available_stock: number;
  is_active: boolean;
  image_url?: string | null;
}
