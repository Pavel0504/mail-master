// src/components/ViewModal.tsx
import React from "react";
import type { MailingWithRecipients } from "../hooks/useMailings";
import { getStatusBadge } from "../utils/mailing";

export default function ViewModal({ mailing, onClose }: { mailing: MailingWithRecipients | null, onClose: () => void }) {
  if (!mailing) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Детали рассылки</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>
        <div className="space-y-4">
          <div>{getStatusBadge(mailing.status)}</div>
          <div>Получателей: {mailing.recipients?.length || 0}</div>
          <div>Успешно: {mailing.success_count}</div>
          <div>Неудачно: {mailing.failed_count}</div>
          <div>
            <h4 className="font-medium">Получатели</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {mailing.recipients?.map(r => (
                <div key={r.id} className="p-3 bg-gray-50 rounded">
                  <div>{r.contact?.email}</div>
                  <div className="text-xs text-gray-500">Отправитель: {r.sender_email?.email}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
