/*
  # Добавление настроек для системы пинг-писем

  1. Новая таблица
    - `ping_settings` - глобальные настройки системы пинг-писем
      - `id` (uuid, primary key)
      - `check_interval_minutes` (integer) - интервал проверки ответов в минутах
      - `wait_time_hours` (integer) - время ожидания ответа перед отправкой пинга в часах
      - `updated_at` (timestamptz) - время последнего обновления
      - `updated_by` (uuid) - кто обновил настройки

  2. Безопасность
    - RLS отключен согласно требованиям проекта
*/

-- Создание таблицы настроек пинг-системы
CREATE TABLE IF NOT EXISTS ping_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_interval_minutes integer DEFAULT 30 NOT NULL CHECK (check_interval_minutes > 0),
  wait_time_hours integer DEFAULT 10 NOT NULL CHECK (wait_time_hours > 0),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Вставка значений по умолчанию
INSERT INTO ping_settings (check_interval_minutes, wait_time_hours)
VALUES (30, 10)
ON CONFLICT DO NOTHING;

-- RLS отключен согласно требованиям проекта
ALTER TABLE ping_settings DISABLE ROW LEVEL SECURITY;
