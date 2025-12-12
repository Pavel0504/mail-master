/*
  # Создание таблиц для групп контактов

  1. Новые таблицы
    - `contact_groups` - группы контактов
      - `id` (uuid, primary key)
      - `name` (text) - название группы
      - `user_id` (uuid) - владелец группы
      - `default_subject` (text) - тема письма по умолчанию
      - `default_text_content` (text) - текст письма по умолчанию
      - `default_html_content` (text) - HTML письма по умолчанию
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `contact_group_members` - связь контактов с группами
      - `id` (uuid, primary key)
      - `group_id` (uuid) - группа
      - `contact_id` (uuid) - контакт
      - `created_at` (timestamptz)

  2. Безопасность
    - RLS отключен согласно требованиям проекта

  3. Индексы
    - Индексы для оптимизации запросов по группам и членам групп
*/

-- Создание таблицы групп контактов
CREATE TABLE IF NOT EXISTS contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_subject text,
  default_text_content text,
  default_html_content text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Создание таблицы членов групп
CREATE TABLE IF NOT EXISTS contact_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, contact_id)
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_contact_groups_user_id ON contact_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_group_id ON contact_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_contact_id ON contact_group_members(contact_id);

-- RLS отключен согласно требованиям проекта
ALTER TABLE contact_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_members DISABLE ROW LEVEL SECURITY;