// src/components/MailingsPage.tsx
import React, { useState } from "react";
import useMailings from "../hooks/useMailings";
import useGroups from "../hooks/useGroups";
import useContacts from "../hooks/useContacts";
import useEmails from "../hooks/useEmails";
import MailingCard from "./MailingCard";
import CreateEditModal from "./CreateEditModal";
import ViewModal from "./ViewModal";
import DeleteModal from "./DeleteModal";
import DuplicatesModal from "./DuplicatesModal";
import MailingsPingPage from "./MailingsPingPage"; // keep existing
import { getStatusBadge, hasPartialErrors } from "../utils/mailing";
import type { MailingWithRecipients } from "../hooks/useMailings";

export function MailingsPage() {
  const { mailings, loading, reload } = useMailings();
  const { groups } = useGroups();
  const { contacts } = useContacts();
  const { emails } = useEmails();

  const [activeTab, setActiveTab] = useState<"pending" | "sent" | "failed" | "ping">("pending");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMailing, setSelectedMailing] = useState<MailingWithRecipients | null>(null);
  const [mailingToDelete, setMailingToDelete] = useState<any | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);

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
              {filtered.map(m => <MailingCard key={m.id} mailing={m} onView={() => setSelectedMailing(m)} onEdit={() => setShowCreate(true)} onDelete={() => setMailingToDelete(m)} onSendNow={(id) => {/* call original send now logic or use endpoint */}} />)}
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
