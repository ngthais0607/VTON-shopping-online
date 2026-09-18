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

export interface Order {
  id: number;
  user_id?: number;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  total: number;
  total_amount?: number;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  payment_status: 'pending' | 'completed' | 'failed';
  expires_at?: string;
  paid_at?: string;
  created_at: string;
}

export interface OrderCreate {
  product_id: number;
  quantity: number;
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
