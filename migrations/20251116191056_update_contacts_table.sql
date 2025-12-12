/*
  # Update contacts table structure

  ## Changes
  - Make `link` field NOT NULL (required when creating contact)
  - Add optional `default_email` field for default contact email
  - Keep `default_sender_email_id` as optional field for sender email
*/

ALTER TABLE contacts
ALTER COLUMN link SET NOT NULL;

-- Add default_email column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' 
    AND column_name = 'default_email'
  ) THEN
    ALTER TABLE contacts ADD COLUMN default_email text;
  END IF;
END $$;
