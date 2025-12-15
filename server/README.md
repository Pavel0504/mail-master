# MailServerCE Server

Локальный сервер для обработки email рассылок MailServerCE.

## Установка

1. Перейдите в директорию сервера:
```bash
cd server
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

4. Заполните переменные окружения в файле `.env`:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# SMTP Configuration (Hostinger)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Origin (your frontend URL)
CORS_ORIGIN=http://localhost:5173
```

## Запуск сервера

### Режим разработки (с автоматической перезагрузкой):
```bash
npm run dev
```

### Режим production:
```bash
npm start
```

Сервер запустится на порту 3001 (или на порту, указанном в .env).

## Использование с ngrok

Для того чтобы локальный сервер был доступен из интернета (например, для webhook'ов или внешних сервисов):

### 1. Установка ngrok

Скачайте и установите ngrok с официального сайта: https://ngrok.com/download

Или через пакетные менеджеры:

**macOS (Homebrew):**
```bash
brew install ngrok/ngrok/ngrok
```

**Linux (Snap):**
```bash
snap install ngrok
```

**Windows (Chocolatey):**
```bash
choco install ngrok
```

### 2. Регистрация и аутентификация

1. Зарегистрируйтесь на https://ngrok.com
2. Получите ваш authtoken
3. Выполните команду:
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

### 3. Запуск ngrok

Сначала запустите локальный сервер:
```bash
npm run dev
```

Затем в отдельном терминале запустите ngrok:
```bash
ngrok http 3001
```

Вы увидите вывод вида:
```
Session Status                online
Account                       your-email@example.com
Version                       3.x.x
Region                        United States (us)
Forwarding                    https://abc123.ngrok.io -> http://localhost:3001
```

Теперь ваш сервер доступен по URL `https://abc123.ngrok.io`

### 4. Обновление CORS_ORIGIN

После запуска ngrok обновите переменную `CORS_ORIGIN` в `.env` файле, чтобы включить ngrok URL:
```env
CORS_ORIGIN=http://localhost:5173,https://abc123.ngrok.io
```

И перезапустите сервер.

### 5. Использование ngrok URL

Используйте полученный ngrok URL в вашем фронтенде для отправки запросов:
```javascript
const API_URL = 'https://abc123.ngrok.io';

// Пример запроса
const response = await fetch(`${API_URL}/api/process-mailing`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ mailing_id: 'your-mailing-id' })
});
```

## API Endpoints

### Health Check
```
GET /health
```
Проверка состояния сервера.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "service": "MailServerCE Email Processing Server"
}
```

### Process Mailing
```
POST /api/process-mailing
```
Запуск обработки рассылки.

**Request Body:**
```json
{
  "mailing_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Mailing processing started",
  "mailing_id": "uuid"
}
```

### Send Email
```
POST /api/send-email
```
Отправка email получателю.

**Request Body:**
```json
{
  "recipient_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email queued for sending",
  "recipient_id": "uuid"
}
```

## Структура проекта

```
server/
├── src/
│   ├── config/
│   │   ├── supabase.js      # Конфигурация Supabase клиента
│   │   └── smtp.js          # Конфигурация SMTP/nodemailer
│   └── index.js             # Главный файл сервера
├── .env                     # Переменные окружения (не в git)
├── .env.example             # Пример переменных окружения
├── package.json             # Зависимости проекта
└── README.md               # Документация
```

## Отладка

Для включения детального логирования SMTP установите:
```env
NODE_ENV=development
```

Это включит debug режим nodemailer для диагностики проблем с отправкой email.

## Безопасность

- Никогда не коммитьте файл `.env` в git
- Используйте SERVICE_ROLE_KEY только на сервере, никогда на клиенте
- При использовании ngrok в production рассмотрите использование базового плана с постоянными URL и аутентификацией

## Устранение проблем

### Ошибка: "Missing Supabase configuration"
Проверьте что в `.env` файле заполнены `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`.

### Ошибка подключения к SMTP
Проверьте:
- Правильность учетных данных email
- Настройки SMTP_HOST, SMTP_PORT, SMTP_SECURE
- Что ваш провайдер не блокирует исходящие подключения на порт 465

### CORS ошибки
Убедитесь что `CORS_ORIGIN` в `.env` содержит URL вашего фронтенда.
