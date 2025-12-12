// src/components/CreateEditModal/ContentInputs.tsx
import React from "react";
import type { MailingCreatePayload } from "../../types";

export default function ContentInputs({ payload, onChange }: { payload: MailingCreatePayload, onChange: (p: MailingCreatePayload) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Тема</label>
      <input value={payload.subject} onChange={(e)=>onChange({...payload, subject: e.target.value})} className="w-full px-3 py-2 rounded" />
      <label className="block text-sm font-medium mt-3 mb-2">Текст</label>
      <textarea value={payload.text_content} onChange={(e)=>onChange({...payload, text_content: e.target.value})} rows={4} className="w-full px-3 py-2 rounded" />
      <label className="block text-sm font-medium mt-3 mb-2">HTML (опционально)</label>
      <textarea value={payload.html_content} onChange={(e)=>onChange({...payload, html_content: e.target.value})} rows={6} className="w-full px-3 py-2 rounded" />
    </div>
  );
}
