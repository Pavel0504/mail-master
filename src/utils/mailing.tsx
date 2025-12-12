// src/utils/mailing.ts
import React from "react";
import { CheckCircle, XCircle, Clock } from "lucide-react";

export const getStatusBadge = (status: string) => {
  switch (status) {
    case "sent":
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="w-3 h-3" />
          Отправлено
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="w-3 h-3" />
          Ошибка
        </span>
      );
    case "pending":
    case "sending":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          <Clock className="w-3 h-3" />
          {status === "sending" ? "Отправка" : "Ожидание"}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
          {status}
        </span>
      );
  }
};

export const hasPartialErrors = (mailing: any) =>
  (mailing.status === "sent" || mailing.status === "completed") &&
  mailing.success_count > 0 &&
  mailing.failed_count > 0;
