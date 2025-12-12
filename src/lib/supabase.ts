import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  login: string;
  password: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  user_id: string;
  email: string;
  password: string;
  status: string;
  sent_count: number;
  success_count: number;
  failed_count: number;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  link: string;
  owner_id: string;
  default_sender_email_id: string | null;
  created_at: string;
  updated_at: string;
  has_changes: boolean;
}

export interface Mailing {
  id: string;
  user_id: string;
  subject: string;
  text_content: string | null;
  html_content: string | null;
  scheduled_at: string | null;
  timezone: string;
  status: string;
  sent_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  user_id: string;
  parent_group_id: string | null;
  default_subject: string | null;
  default_text_content: string | null;
  default_html_content: string | null;
  default_sender_email_id: string | null;
  ping_subject: string | null;
  ping_text_content: string | null;
  ping_html_content: string | null;
  ping_delay_hours: number;
  created_at: string;
  updated_at: string;
}

export interface ContactGroupMember {
  id: string;
  group_id: string;
  contact_id: string;
  created_at: string;
}

export interface MailingPingTracking {
  id: string;
  mailing_recipient_id: string;
  initial_sent_at: string;
  response_received: boolean;
  response_received_at: string | null;
  ping_sent: boolean;
  ping_sent_at: string | null;
  ping_subject: string | null;
  ping_text_content: string | null;
  ping_html_content: string | null;
  status: 'awaiting_response' | 'response_received' | 'ping_sent' | 'no_response';
  created_at: string;
  updated_at: string;
}

export interface PingSettings {
  id: string;
  check_interval_minutes: number;
  wait_time_hours: number;
  updated_at: string;
  updated_by: string | null;
}
