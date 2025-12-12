// src/components/CreateEditModal/index.tsx
import React, { useMemo, useState } from "react";
import type { Email, Contact } from "../../types";
import GroupWithSubgroups from "./GroupWithSubgroups";
import FileLoaders from "./FileLoaders";
import SchedulePicker from "./SchedulePicker";
import ContentInputs from "./ContentInputs";
import { useCreateMailing } from "../../hooks/useCreateMailing";
import type { MailingCreatePayload } from "../../types";

interface Props {
  open: boolean;
  onClose: () => void;
  groups: any[];
  emails: Email[];
  contacts: Contact[];
  initial?: MailingCreatePayload;
  onCreated?: () => void;
}

export function CreateEditModal({ open, onClose, groups, emails, contacts, initial, onCreated }: Props) {
  const { createMailing, loading, error } = useCreateMailing();
  const [payload, setPayload] = useState<MailingCreatePayload>(initial || {
    subject: "",
    text_content: "",
    html_content: "",
    scheduled_at: "",
    scheduled_time: "",
    timezone: "UTC",
    selected_contacts: [],
    selected_groups: [],
    exclude_contacts: [],
    send_now: false,
    subgroup_email_overrides: {},
  });

  // Local state to coordinate selections (a small subset of original logic)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedSubgroups, setSelectedSubgroups] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!payload.subject) return alert("Заполните тему");
    if (!payload.send_now && (!payload.scheduled_at || !payload.scheduled_time)) {
      // allow immediate send or scheduled
    }
    await createMailing(
      { ...payload, selected_contacts: selectedContacts },
      {
        selectedSubgroups,
        selectedContactsFromUI: selectedContacts,
        contacts,
        emails,
      }
    );
    onCreated?.();
    onClose();
  };

  const onGroupToggle = (groupId: string) => {
    const s = new Set(expandedGroups);
    if (s.has(groupId)) s.delete(groupId); else s.add(groupId);
    setExpandedGroups(s);
  };

  return !open ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Создать рассылку</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <ContentInputs payload={payload} onChange={setPayload} />
          <div>
            <label className="block text-sm font-medium mb-2">Выбор групп</label>
            {groups.length === 0 ? <div className="p-3 text-sm text-gray-500">Нет групп</div> : (
              <div className="space-y-2">
                {groups.map(g => (
                  <GroupWithSubgroups
                    key={g.id}
                    group={g}
                    isSelected={payload.selected_groups.includes(g.id)}
                    isExpanded={expandedGroups.has(g.id)}
                    emails={emails}
                    selectedSubgroups={selectedSubgroups}
                    selectedContacts={selectedContacts}
                    subgroupEmailOverrides={payload.subgroup_email_overrides}
                    expandedSubgroups={expandedSubgroups}
                    onToggle={() => onGroupToggle(g.id)}
                    onCheckChange={(checked) => {
                      setPayload(prev => ({ ...prev, selected_groups: checked ? [...prev.selected_groups, g.id] : prev.selected_groups.filter(id => id !== g.id) }));
                    }}
                    onSubgroupCheck={(id, checked) => {
                      setSelectedSubgroups(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
                    }}
                    onContactCheck={(id, checked) => {
                      setSelectedContacts(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
                    }}
                    onSubgroupToggle={(id) => {
                      const s = new Set(expandedSubgroups);
                      if (s.has(id)) s.delete(id); else s.add(id);
                      setExpandedSubgroups(s);
                    }}
                    onEmailOverride={(subId, emailId) => setPayload(prev => ({ ...prev, subgroup_email_overrides: { ...prev.subgroup_email_overrides, [subId]: emailId } }))}
                  />
                ))}
              </div>
            )}
          </div>

          <SchedulePicker payload={payload} onChange={setPayload} />
          <FileLoaders
            onLoadText={(text) => setPayload(p => ({ ...p, text_content: text }))}
            onLoadHtml={(html) => setPayload(p => ({ ...p, html_content: html }))}
          />

          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg">Отменить</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">{loading ? "Создание..." : "Создать"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default CreateEditModal;
