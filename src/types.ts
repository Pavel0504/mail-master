// Central type definitions for MailServerCE application
// Re-exports from supabase.ts and additional types

export type {
  User,
  Email,
  Contact,
  Mailing,
  Notification,
  ActivityLog,
  ContactGroup,
  ContactGroupMember,
  MailingPingTracking,
  PingSettings
} from './lib/supabase';

// Additional payload types for operations

export interface MailingCreatePayload {
  subject: string;
  text_content?: string | null;
  html_content?: string | null;
  scheduled_at?: string;
  scheduled_time?: string;
  timezone?: string;
  selected_contacts: string[];
  selected_groups: string[];
  exclude_contacts: string[];
  send_now: boolean;
  subgroup_email_overrides: Record<string, string>;
}

export interface MailingRecipient {
  id: string;
  mailing_id: string;
  contact_id: string;
  sender_email_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  contact?: Contact;
  sender_email?: Email;
}

export interface MailingWithRecipients extends Mailing {
  recipients?: MailingRecipient[];
}
