/*
  # Complete MailServerCE Database Schema

  ## Tables Created
  1. users - System users with authentication
  2. emails - Email accounts for sending
  3. contacts - Contact database (shared among users)
  4. contact_shares - Requests for access to contacts
  5. contact_exclusions - Email exclusion list
  6. contact_history - Contact change history
  7. mailings - Email campaigns
  8. mailing_recipients - Individual mailing recipients
  9. notifications - User notifications
  10. activity_logs - System activity logging

  ## Security
  - RLS is disabled per requirements
  - All tables have proper indexes
  - Foreign key relationships with appropriate CASCADE rules
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Emails table (for sending)
CREATE TABLE IF NOT EXISTS emails (
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
CREATE TABLE IF NOT EXISTS contacts (
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
CREATE TABLE IF NOT EXISTS contact_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Contact exclusions table
CREATE TABLE IF NOT EXISTS contact_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  contact_email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email_id, contact_email)
);

-- Contact history table
CREATE TABLE IF NOT EXISTS contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  changed_fields jsonb DEFAULT '{}'::jsonb,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Mailings table
CREATE TABLE IF NOT EXISTS mailings (
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
CREATE TABLE IF NOT EXISTS mailing_recipients (
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
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contact_shares_requester ON contact_shares(requester_id);
CREATE INDEX IF NOT EXISTS idx_contact_shares_owner ON contact_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_contact ON contact_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_mailings_user_id ON mailings(user_id);
CREATE INDEX IF NOT EXISTS idx_mailings_status ON mailings(status);
CREATE INDEX IF NOT EXISTS idx_mailings_scheduled ON mailings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_mailing_recipients_mailing ON mailing_recipients(mailing_id);
CREATE INDEX IF NOT EXISTS idx_mailing_recipients_contact ON mailing_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_mailing_recipients_status ON mailing_recipients(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Insert default admin user if not exists
INSERT INTO users (login, password, role)
VALUES ('admin', 'pass', 'admin')
ON CONFLICT (login) DO NOTHING;
