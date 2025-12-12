/*
  # Добавление функционала отслеживания ответов и пинг-писем

  1. Изменения в contact_groups
    - Добавление полей для пинг-писем:
      - `ping_subject` (text) - тема пинг-письма
      - `ping_text_content` (text) - текст пинг-письма
      - `ping_html_content` (text) - HTML пинг-письма
      - `ping_delay_hours` (integer) - задержка перед отправкой пинга (в часах)

  2. Новая таблица mailing_ping_tracking
    - `id` (uuid, primary key) - идентификатор записи отслеживания
    - `mailing_recipient_id` (uuid) - ссылка на получателя рассылки
    - `initial_sent_at` (timestamptz) - время первой отправки
    - `response_received` (boolean) - получен ли ответ
    - `response_received_at` (timestamptz) - время получения ответа
    - `ping_sent` (boolean) - отправлено ли пинг-письмо
    - `ping_sent_at` (timestamptz) - время отправки пинг-письма
    - `ping_subject` (text) - тема отправленного пинг-письма
    - `ping_text_content` (text) - текст отправленного пинг-письма
    - `ping_html_content` (text) - HTML отправленного пинг-письма
    - `status` (text) - статус отслеживания (awaiting_response | response_received | ping_sent | no_response)
    - `created_at` (timestamptz) - дата создания записи
    - `updated_at` (timestamptz) - дата последнего обновления

  3. Безопасность
    - RLS отключен согласно требованиям проекта

  4. Индексы
    - Индексы для оптимизации запросов
*/

-- Добавление полей для пинг-писем в contact_groups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'ping_subject'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN ping_subject text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'ping_text_content'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN ping_text_content text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'ping_html_content'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN ping_html_content text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_groups' AND column_name = 'ping_delay_hours'
  ) THEN
    ALTER TABLE contact_groups ADD COLUMN ping_delay_hours integer DEFAULT 72;
  END IF;
END $$;

-- Создание таблицы отслеживания пинг-писем
CREATE TABLE IF NOT EXISTS mailing_ping_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_recipient_id uuid NOT NULL REFERENCES mailing_recipients(id) ON DELETE CASCADE,
  initial_sent_at timestamptz NOT NULL,
  response_received boolean DEFAULT false,
  response_received_at timestamptz,
  ping_sent boolean DEFAULT false,
  ping_sent_at timestamptz,
  ping_subject text,
  ping_text_content text,
  ping_html_content text,
  status text DEFAULT 'awaiting_response' CHECK (status IN ('awaiting_response', 'response_received', 'ping_sent', 'no_response')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(mailing_recipient_id)
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_mailing_ping_tracking_recipient ON mailing_ping_tracking(mailing_recipient_id);
CREATE INDEX IF NOT EXISTS idx_mailing_ping_tracking_status ON mailing_ping_tracking(status);
CREATE INDEX IF NOT EXISTS idx_mailing_ping_tracking_initial_sent ON mailing_ping_tracking(initial_sent_at);
CREATE INDEX IF NOT EXISTS idx_mailing_ping_tracking_response ON mailing_ping_tracking(response_received);

-- RLS отключен согласно требованиям проекта
ALTER TABLE mailing_ping_tracking DISABLE ROW LEVEL SECURITY;
