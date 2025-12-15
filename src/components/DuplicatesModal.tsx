// src/components/DuplicatesModal.tsx
import React from "react";
import { ChevronDown, ChevronRight, Mail, Calendar, AlertCircle } from "lucide-react";

export default function DuplicatesModal({
  duplicates,
  open,
  onClose,
  onEditMailing,
  onExcludeAndContinue,
}: {
  duplicates: any[];
  open: boolean;
  onClose: () => void;
  onEditMailing: () => void;
  onExcludeAndContinue: (excludedIds: string[]) => Promise<void>;
}) {
  const [included, setIncluded] = React.useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set());

  if (!open) return null;

  const toggleExpanded = (contactId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(contactId)) {
      newExpanded.delete(contactId);
    } else {
      newExpanded.add(contactId);
    }
    setExpandedItems(newExpanded);
  };

  const toggleIncluded = (contactId: string) => {
    const newIncluded = new Set(included);
    if (newIncluded.has(contactId)) {
      newIncluded.delete(contactId);
    } else {
      newIncluded.add(contactId);
    }
    setIncluded(newIncluded);
  };

  const toggleSelectAll = () => {
    if (included.size === duplicates.length) {
      // If all are selected, deselect all
      setIncluded(new Set());
    } else {
      // Select all
      setIncluded(new Set(duplicates.map(dup => dup.contact_id)));
    }
  };

  const handleContinue = () => {
    // Get IDs of contacts that ARE included (checked = exclude)
    const excludedIds = duplicates
      .map(dup => dup.contact_id)
      .filter(id => included.has(id));
    onExcludeAndContinue(excludedIds);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400">На эти контакты рассылка уже была</h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            Закрыть
          </button>
        </div>

        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Отметьте галочкой контакты, которые нужно ИСКЛЮЧИТЬ из рассылки. Неотмеченные контакты получат письмо.
          </p>
        </div>

        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={included.size === duplicates.length && duplicates.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Выделить все ({duplicates.length})
            </span>
          </label>
        </div>

        <div className="mb-6 space-y-2 max-h-96 overflow-y-auto">
          {duplicates.map(dup => {
            const isIncluded = included.has(dup.contact_id);
            const isExpanded = expandedItems.has(dup.contact_id);

            return (
              <div
                key={dup.contact_id}
                className={`border rounded-lg transition-all ${
                  isIncluded
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                }`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => toggleIncluded(dup.contact_id)}
                      className="mt-1 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <button
                        onClick={() => toggleExpanded(dup.contact_id)}
                        className="w-full text-left flex items-center gap-2 hover:opacity-70 transition-opacity"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">{dup.contact_email}</div>
                          {dup.contact_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{dup.contact_name}</div>
                          )}
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Найдено рассылок: {dup.mailings.length}
                          </div>
                        </div>
                      </button>

                      {isExpanded && dup.mailings && dup.mailings.length > 0 && (
                        <div className="mt-3 pl-6 space-y-2 border-l-2 border-gray-200 dark:border-gray-600">
                          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                            История рассылок
                          </h4>
                          {dup.mailings.map((mailing: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600"
                            >
                              <div className="flex items-start gap-2 mb-1">
                                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {mailing.subject || "Без темы"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 ml-5">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {new Date(mailing.sent_at || mailing.created_at).toLocaleString("ru-RU", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              {mailing.sender_email && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 ml-5 mt-1">
                                  От: {mailing.sender_email}
                                </div>
                              )}
                              <div className={`text-xs mt-1 ml-5 ${
                                mailing.status === "sent" || mailing.status === "completed"
                                  ? "text-green-600 dark:text-green-400"
                                  : mailing.status === "failed"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-yellow-600 dark:text-yellow-400"
                              }`}>
                                Статус: {
                                  mailing.status === "sent" || mailing.status === "completed"
                                    ? "Отправлено"
                                    : mailing.status === "failed"
                                    ? "Ошибка"
                                    : "Ожидание"
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Отменить
          </button>
          <button
            onClick={onEditMailing}
            className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
          >
            Редактировать рассылку
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Исключить отмеченные и продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
