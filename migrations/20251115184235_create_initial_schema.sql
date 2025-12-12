/*
  # Initial Schema for MailServerCE
  
  1. New Tables
    - `users`
      - `id` (uuid, primary key) - User identifier
      - `login` (text, unique) - Username for authentication
      - `password` (text) - Hashed password
      - `role` (text) - User role (user | admin)
      - `created_at` (timestamptz) - Account creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `emails`
      - `id` (uuid, primary key) - Email account identifier
      - `user_id` (uuid, foreign key) - Owner of the email
      - `email` (text, unique) - Email address
      - `password` (text) - Email password (encrypted)
      - `status` (text) - Email validation status
      - `sent_count` (integer) - Total emails sent
      - `success_count` (integer) - Successfully sent emails
      - `failed_count` (integer) - Failed emails
      - `last_checked` (timestamptz) - Last status check timestamp
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `contacts`
      - `id` (uuid, primary key) - Contact identifier
      - `email` (text, unique) - Contact email address
      - `name` (text) - Contact name
      - `link` (text) - Related link
      - `owner_id` (uuid, foreign key) - Original creator
      - `default_sender_email_id` (uuid, foreign key) - Default sending email
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
      - `has_changes` (boolean) - Flag for new changes
    
    - `contact_shares`
      - `id` (uuid, primary key) - Share request identifier
      - `contact_id` (uuid, foreign key) - Shared contact
      - `requester_id` (uuid, foreign key) - User requesting access
      - `owner_id` (uuid, foreign key) - Contact owner
      - `status` (text) - Request status (pending | approved | rejected)
      - `created_at` (timestamptz) - Request timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `contact_exclusions`
      - `id` (uuid, primary key) - Exclusion identifier
      - `email_id` (uuid, foreign key) - Sending email
      - `contact_id` (uuid, foreign key) - Excluded contact
      - `created_at` (timestamptz) - Creation timestamp
    
    - `contact_history`
      - `id` (uuid, primary key) - History record identifier
      - `contact_id` (uuid, foreign key) - Related contact
      - `user_id` (uuid, foreign key) - User who made the change
      - `action_type` (text) - Type of action (created | edited | email_sent)
      - `details` (jsonb) - Action details
      - `created_at` (timestamptz) - Action timestamp
    
    - `mailings`
      - `id` (uuid, primary key) - Mailing identifier
      - `user_id` (uuid, foreign key) - Creator
      - `subject` (text) - Email subject
      - `text_content` (text) - Plain text content
      - `html_content` (text) - HTML content
      - `scheduled_at` (timestamptz) - Scheduled send time
      - `timezone` (text) - Timezone for scheduling
      - `status` (text) - Mailing status (pending | in_progress | completed | failed)
      - `sent_count` (integer) - Number of emails sent
      - `success_count` (integer) - Successfully delivered
      - `failed_count` (integer) - Failed deliveries
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `mailing_recipients`
      - `id` (uuid, primary key) - Recipient record identifier
      - `mailing_id` (uuid, foreign key) - Related mailing
      - `contact_id` (uuid, foreign key) - Recipient contact
      - `email_id` (uuid, foreign key) - Sending email used
      - `status` (text) - Delivery status (pending | sent | failed)
      - `sent_at` (timestamptz) - Send timestamp
      - `error_message` (text) - Error details if failed
      - `created_at` (timestamptz) - Creation timestamp
    
    - `notifications`
      - `id` (uuid, primary key) - Notification identifier
      - `user_id` (uuid, foreign key) - Recipient user
      - `type` (text) - Notification type
      - `message` (text) - Notification message
      - `data` (jsonb) - Additional data
      - `read` (boolean) - Read status
      - `created_at` (timestamptz) - Creation timestamp
    
    - `activity_logs`
      - `id` (uuid, primary key) - Log identifier
      - `user_id` (uuid, foreign key) - User who performed action
      - `action_type` (text) - Type of action
      - `entity_type` (text) - Entity affected (contact | email | mailing | etc)
      - `entity_id` (uuid) - ID of affected entity
      - `details` (jsonb) - Action details
      - `created_at` (timestamptz) - Action timestamp
  
  2. Security
    - No RLS as per requirements
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  status text DEFAULT 'unchecked',
  sent_count integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  last_checked timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text DEFAULT '',
  link text DEFAULT '',
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_sender_email_id uuid REFERENCES emails(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  has_changes boolean DEFAULT false
);

-- Create contact_shares table
CREATE TABLE IF NOT EXISTS contact_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create contact_exclusions table
CREATE TABLE IF NOT EXISTS contact_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email_id, contact_id)
);

-- Create contact_history table
CREATE TABLE IF NOT EXISTS contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create mailings table
CREATE TABLE IF NOT EXISTS mailings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
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

-- Create mailing_recipients table
CREATE TABLE IF NOT EXISTS mailing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_id uuid NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_shares_requester_id ON contact_shares(requester_id);
CREATE INDEX IF NOT EXISTS idx_contact_shares_owner_id ON contact_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_contact_id ON contact_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_mailings_user_id ON mailings(user_id);
CREATE INDEX IF NOT EXISTS idx_mailings_status ON mailings(status);
CREATE INDEX IF NOT EXISTS idx_mailing_recipients_mailing_id ON mailing_recipients(mailing_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Insert default admin user (password: pass - in production should be hashed)
INSERT INTO users (login, password, role)
VALUES ('admin', 'pass', 'admin')
ON CONFLICT (login) DO NOTHING;