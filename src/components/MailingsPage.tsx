// src/components/MailingsPage.tsx
import React, { useState } from "react";
import useMailings from "../hooks/useMailings";
import useGroups from "../hooks/useGroups";
import useContacts from "../hooks/useContacts";
import useEmails from "../hooks/useEmails";
import { useMailingSender } from "../hooks/useMailingSender";
import MailingCard from "./MailingCard";
import CreateEditModal from "./CreateEditModal";
import ViewModal from "./ViewModal";
import DeleteModal from "./DeleteModal";
import DuplicatesModal from "./DuplicatesModal";
import MailingsPingPage from "./MailingsPingPage"; // keep existing
import { getStatusBadge, hasPartialErrors } from "../utils/mailing";
import type { MailingWithRecipients } from "../hooks/useMailings";
import { X, AlertCircle } from "lucide-react";

export function MailingsPage() {
  const { mailings, loading, reload } = useMailings();
  const { groups } = useGroups();
  const { contacts } = useContacts();
  const { emails } = useEmails();
  const { state: senderState, startMailing, stopMailing } = useMailingSender();

  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "failed" | "ping">("pending");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMailing, setSelectedMailing] = useState<MailingWithRecipients | null>(null);
  const [mailingToDelete, setMailingToDelete] = useState<any | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);

  // Auto-reload when mailing completes
  React.useEffect(() => {
    if (senderState.mailingId && !senderState.isActive) {
      reload();
    }
  }, [senderState.isActive, senderState.mailingId, reload]);

  const filtered = mailings.filter(m => {
    if (activeTab === "pending") return m.status === "pending" || m.status === "sending";
    if (activeTab === "sent") return m.status === "sent" || m.status === "completed";
    if (activeTab === "failed") return m.status === "failed";
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Управление рассылками</h1>
        <button onClick={()=>setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded">Создать рассылку</button>
      </div>

      {senderState.isActive && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Отправка рассылки...
              </h3>

              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Прогресс: <span className="text-blue-600 dark:text-blue-400">{senderState.sentCount} / {senderState.totalRecipients}</span>
                  </span>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Успешно: {senderState.successCount}
                  </span>
                  {senderState.failedCount > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      Ошибок: {senderState.failedCount}
                    </span>
                  )}
                </div>

                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${senderState.totalRecipients > 0 ? (senderState.sentCount / senderState.totalRecipients) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={stopMailing}
              className="ml-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Остановить
            </button>
          </div>

          {senderState.error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{senderState.error}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex border-b border-gray-200 dark:border-gray-700">
          <button className={`px-6 py-3 ${activeTab==="pending" ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={()=>setActiveTab("pending")}>Ожидают</button>
          <button className={`px-6 py-3 ${activeTab==="sent" ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={()=>setActiveTab("sent")}>Успешные</button>
          <button className={`px-6 py-3 ${activeTab==="failed" ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={()=>setActiveTab("failed")}>Неудачные</button>
          <button className={`px-6 py-3 ${activeTab==="ping" ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400" : "text-gray-600 dark:text-gray-300"}`} onClick={()=>setActiveTab("ping")}>Пинг</button>
        </nav>

        {activeTab === "ping" ? <MailingsPingPage /> : (
          <div className="p-6">
            {filtered.length === 0 ? <div className="text-center py-12">Нет рассылок</div> : <div className="space-y-4">
              {filtered.map(m => <MailingCard key={m.id} mailing={m} onView={() => setSelectedMailing(m)} onEdit={() => setShowCreate(true)} onDelete={() => setMailingToDelete(m)} onSendNow={startMailing} loading={senderState.isActive && senderState.mailingId === m.id} />)}
            </div>}
          </div>
        )}
      </div>

      <CreateEditModal open={showCreate} onClose={()=> { setShowCreate(false); reload(); }} groups={groups} emails={emails} contacts={contacts} onCreated={() => reload()} />
      <ViewModal mailing={selectedMailing} onClose={() => setSelectedMailing(null)} />
      <DeleteModal mailing={mailingToDelete} onClose={() => setMailingToDelete(null)} onDeleted={() => reload()} />
      <DuplicatesModal duplicates={duplicates} open={showDuplicates} onClose={() => setShowDuplicates(false)} onExcludeAndContinue={async (ids) => { /* call create with exclusions */ }} />
    </div>
  );
}
export default MailingsPage;
