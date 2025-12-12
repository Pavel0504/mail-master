/*
  # Add sender_email_id column to mailing_recipients

  1. Changes
    - Add `sender_email_id` column to `mailing_recipients` table
    - Set up foreign key relationship to `emails` table
    - Add index for performance optimization
  
  2. Notes
    - This column is needed to track which email account was used to send to each recipient
    - Allows for proper routing of emails through different sender accounts
*/

-- Add sender_email_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mailing_recipients' AND column_name = 'sender_email_id'
  ) THEN
    ALTER TABLE mailing_recipients ADD COLUMN sender_email_id uuid REFERENCES emails(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_mailing_recipients_sender_email_id 
ON mailing_recipients(sender_email_id);