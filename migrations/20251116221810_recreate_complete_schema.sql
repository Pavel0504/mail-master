/*
  # Recreate Complete MailServerCE Database Schema

  ## Tables Created
  1. users - System users with authentication
  2. emails - Email accounts for sending
  3. contacts - Contact database (shared among users)
  4. contact_shares - Requests for access to contacts
  5. contact_exclusions - Email exclusion list (with contact_email column)
  6. contact_history - Contact change history (with changed_by column)
  7. mailings - Email campaigns
  8. mailing_recipients - Individual mailing recipients
  9. notifications - User notifications
  10. activity_logs - System activity logging

  ## Security
  - RLS is disabled per requirements
  - All tables have proper indexes
  - Foreign key relationships with appropriate CASCADE rules
*/

-- Drop existing tables if they exist (in correct order to respect foreign keys)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS mailing_recipients CASCADE;
DROP TABLE IF EXISTS mailings CASCADE;
DROP TABLE IF EXISTS contact_history CASCADE;
DROP TABLE IF EXISTS contact_exclusions CASCADE;
DROP TABLE IF EXISTS contact_shares CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Emails table (for sending)
CREATE TABLE emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  password text NOT NULL,
  status text DEFAULT 'active',
  sent_count integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  last_checked timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contacts table
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text DEFAULT '',
  link text DEFAULT '',
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_sender_email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  has_changes boolean DEFAULT false
);

-- Contact shares table
CREATE TABLE contact_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Contact exclusions table (FIXED: uses contact_email instead of contact_id)
CREATE TABLE contact_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  contact_email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email_id, contact_email)
);

-- Contact history table (FIXED: has changed_by and changed_fields)
CREATE TABLE contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  changed_fields jsonb DEFAULT '{}'::jsonb,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Mailings table
CREATE TABLE mailings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text DEFAULT '',
  text_content text,
  html_content text,
  scheduled_at timestamptz,
  timezone text DEFAULT 'UTC',
  status text DEFAULT 'pending',
  sent_count integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mailing recipients table
CREATE TABLE mailing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_id uuid NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sender_email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Notifications table
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Activity logs table
CREATE TABLE activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_contacts_owner_id ON contacts(owner_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contact_shares_requester ON contact_shares(requester_id);
CREATE INDEX idx_contact_shares_owner ON contact_shares(owner_id);
CREATE INDEX idx_contact_exclusions_email ON contact_exclusions(email_id);
CREATE INDEX idx_contact_history_contact ON contact_history(contact_id);
CREATE INDEX idx_contact_history_changed_by ON contact_history(changed_by);
CREATE INDEX idx_mailings_user_id ON mailings(user_id);
CREATE INDEX idx_mailings_status ON mailings(status);
CREATE INDEX idx_mailings_scheduled ON mailings(scheduled_at);
CREATE INDEX idx_mailing_recipients_mailing ON mailing_recipients(mailing_id);
CREATE INDEX idx_mailing_recipients_contact ON mailing_recipients(contact_id);
CREATE INDEX idx_mailing_recipients_status ON mailing_recipients(status);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- Disable RLS on all tables (per requirements)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE contact_shares DISABLE ROW LEVEL SECURITY;
ALTER TABLE contact_exclusions DISABLE ROW LEVEL SECURITY;
ALTER TABLE contact_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE mailings DISABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_recipients DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;

-- Insert default admin user
INSERT INTO users (login, password, role)
VALUES ('admin', 'pass', 'admin');
