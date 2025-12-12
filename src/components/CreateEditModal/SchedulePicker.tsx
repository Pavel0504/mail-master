// src/components/CreateEditModal/SchedulePicker.tsx
import React from "react";
import type { MailingCreatePayload } from "../../types";

const TIMEZONES = [
  { label: "UTC", iana: "Etc/UTC" },
  { label: "CET", iana: "Europe/Berlin" },
  { label: "MSK", iana: "Europe/Moscow" },
  { label: "ET", iana: "America/New_York" },
];

export default function SchedulePicker({ payload, onChange }: { payload: MailingCreatePayload, onChange: (p: MailingCreatePayload) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={payload.send_now} onChange={(e) => onChange({ ...payload, send_now: e.target.checked })} />
        <span>Отправить сейчас</span>
      </label>

      {!payload.send_now && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
          <div>
            <label className="text-sm">Дата</label>
            <input type="date" value={payload.scheduled_at} onChange={(e) => onChange({ ...payload, scheduled_at: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="text-sm">Время</label>
            <input type="time" value={payload.scheduled_time} onChange={(e) => onChange({ ...payload, scheduled_time: e.target.value })} className="w-full" />
          </div>
          <div>
            <label className="text-sm">Часовой пояс</label>
            <select value={payload.timezone} onChange={(e) => onChange({ ...payload, timezone: e.target.value })} className="w-full">
              {TIMEZONES.map(t => <option key={t.iana} value={t.iana}>{t.label}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
