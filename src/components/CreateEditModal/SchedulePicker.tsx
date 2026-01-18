// src/components/CreateEditModal/SchedulePicker.tsx
import React from "react";
import type { MailingCreatePayload } from "../../types";

const TIMEZONES = [
  { label: 'ET', iana: 'America/New_York', name: 'Eastern Time' },
  { label: 'CT', iana: 'America/Chicago', name: 'Central Time' },
  { label: 'MT', iana: 'America/Denver', name: 'Mountain Time' },
  { label: 'PT', iana: 'America/Los_Angeles', name: 'Pacific Time' },
  { label: 'GMT', iana: 'Etc/GMT', name: 'Greenwich Mean Time' },
  { label: 'UTC', iana: 'Etc/UTC', name: 'Coordinated Universal Time' },
  { label: 'CET', iana: 'Europe/Berlin', name: 'Central European Time' },
  { label: 'EET', iana: 'Europe/Helsinki', name: 'Eastern European Time' },
  { label: 'MSK', iana: 'Europe/Moscow', name: 'Moscow Time' },
  { label: 'IST', iana: 'Asia/Kolkata', name: 'India Standard Time' },
  { label: 'CST', iana: 'Asia/Shanghai', name: 'China Standard Time' },
  { label: 'HKT', iana: 'Asia/Hong_Kong', name: 'Hong Kong Time' },
  { label: 'JST', iana: 'Asia/Tokyo', name: 'Japan Standard Time' },
  { label: 'KST', iana: 'Asia/Seoul', name: 'Korea Standard Time' },
];

export default function SchedulePicker({ payload, onChange }: { payload: MailingCreatePayload, onChange: (p: MailingCreatePayload) => void }) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={payload.send_now} 
          onChange={(e) => onChange({ ...payload, send_now: e.target.checked })} 
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Отправить сейчас</span>
      </label>

      {!payload.send_now && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Дата <span className="text-red-600">*</span>
              </label>
              <input 
                type="date" 
                value={payload.scheduled_at} 
                onChange={(e) => onChange({ ...payload, scheduled_at: e.target.value })} 
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                required={!payload.send_now}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Время <span className="text-red-600">*</span>
              </label>
              <input 
                type="time" 
                value={payload.scheduled_time} 
                onChange={(e) => onChange({ ...payload, scheduled_time: e.target.value })} 
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                required={!payload.send_now}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Часовой пояс <span className="text-red-600">*</span>
              </label>
              <select 
                value={payload.timezone} 
                onChange={(e) => onChange({ ...payload, timezone: e.target.value })} 
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.iana} value={tz.iana}>
                    {tz.label} - {tz.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Рассылка будет отправлена автоматически в указанное время
          </div>
        </div>
      )}
    </div>
  );
}
