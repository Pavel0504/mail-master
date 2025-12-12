/*
  # Enhance Contact Groups System

  1. Changes
    - Add parent_group_id to contact_groups for hierarchical structure
    - Add default_sender_email_id to contact_groups for default sender selection
    - Create indexes for better performance

  2. Features
    - Hierarchical groups (main groups -> subgroups)
    - Default sender email per group
    - Better query performance with indexes
*/

-- Add parent_group_id for hierarchical structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'parent_group_id'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN parent_group_id uuid REFERENCES contact_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add default_sender_email_id for default sender selection
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'default_sender_email_id'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN default_sender_email_id uuid REFERENCES emails(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contact_groups_parent ON contact_groups(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_user ON contact_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_group ON contact_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_contact ON contact_group_members(contact_id);
