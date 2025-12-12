// src/components/MailingCard.tsx
import React from "react";
import { Eye, Edit2, Send, Trash2 } from "lucide-react";
import { getStatusBadge, hasPartialErrors } from "../utils/mailing";
import type { MailingWithRecipients } from "../hooks/useMailings";

interface Props {
  mailing: MailingWithRecipients;
  onView: (m: MailingWithRecipients) => void;
  onEdit: (m: MailingWithRecipients) => void;
  onDelete: (m: MailingWithRecipients) => void;
  onSendNow: (id: string) => void;
  loading?: boolean;
}
export function MailingCard({ mailing, onView, onEdit, onDelete, onSendNow, loading }: Props) {
  return (
    <div className="p-5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Рассылка {new Date(mailing.created_at).toLocaleString("ru-RU", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}
            </h3>
            {getStatusBadge(mailing.status)}
            {hasPartialErrors(mailing) && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Есть отправления с ошибкой</span>}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>Получателей: {mailing.recipients?.length || 0}</p>
            <p>Успешно: {mailing.success_count} | Неудачно: {mailing.failed_count}</p>
            {mailing.scheduled_at && <p>Запланировано: {new Date(mailing.scheduled_at).toLocaleString("ru-RU")} ({mailing.timezone})</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onView(mailing)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Просмотр"><Eye className="w-5 h-5" /></button>
          {mailing.status === "pending" && <>
            <button onClick={() => onEdit(mailing)} className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors" title="Редактировать"><Edit2 className="w-5 h-5" /></button>
            <button onClick={() => onSendNow(mailing.id)} disabled={loading} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50" title="Отправить сейчас"><Send className="w-5 h-5" /></button>
          </>}
          {(mailing.status === "pending" || mailing.status === "failed") && <button onClick={() => onDelete(mailing)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Удалить"><Trash2 className="w-5 h-5" /></button>}
        </div>
      </div>
    </div>
  );
}
export default MailingCard;
