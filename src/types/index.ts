export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: 'customer' | 'admin' | 'staff';
  yacht_name?: string;
  yacht_model?: string;
  yacht_length?: number;
  marina_berth?: string;
  membership_type: 'standard' | 'premium' | 'vip';
  created_at: string;
}

export interface ServicePackage {
  id: number;
  name: string;
  code: 'basic' | 'premium' | 'signature';
  description: string;
  price_base: number;
  price_per_meter: number;
  duration_hours: number;
  features: string;
  is_active: number;
}

export interface Booking {
  id: number;
  booking_number: string;
  user_id: number;
  package_id?: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration?: number;
  yacht_name: string;
  yacht_model?: string;
  yacht_length?: number;
  marina_berth?: string;
  special_requests?: string;
  total_price: number;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  admin_notes?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceHistory {
  id: number;
  booking_id: number;
  user_id: number;
  service_type: string;
  description?: string;
  technician_name?: string;
  parts_used?: string;
  before_photos?: string;
  after_photos?: string;
  next_service_date?: string;
  notes?: string;
  completed_at: string;
}

export interface Inquiry {
  id: number;
  name: string;
  email: string;
  phone?: string;
  inquiry_type: string;
  subject: string;
  message: string;
  status: string;
  answer?: string;
  answered_at?: string;
  created_at: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  exp: number;
}
