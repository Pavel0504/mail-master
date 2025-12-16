// src/components/CreateEditModal/index.tsx
import React, { useMemo, useState } from "react";
import type { Email, Contact } from "../../types";
import GroupWithSubgroups from "./GroupWithSubgroups";
import SchedulePicker from "./SchedulePicker";
import { useCreateMailing } from "../../hooks/useCreateMailing";
import type { MailingCreatePayload } from "../../types";
import { supabase } from "../../lib/supabase";
import DuplicatesModal from "../DuplicatesModal";
import ProgressBar from "../ProgressBar";

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

  // Duplicates modal state
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Progress tracking state
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const checkForDuplicates = async () => {
    setCheckingDuplicates(true);
    try {
      const duplicatesFound: any[] = [];

      // Get all sender email IDs that will be used for this mailing
      const senderEmailIds = new Set<string>();

      // Collect sender email IDs from subgroup overrides
      for (const emailId of Object.values(payload.subgroup_email_overrides)) {
        if (emailId) senderEmailIds.add(emailId);
      }

      // If no overrides, use default emails
      if (senderEmailIds.size === 0 && emails.length > 0) {
        senderEmailIds.add(emails[0].id);
      }

      // Check each selected contact for duplicates
      for (const contactId of selectedContacts) {
        const contact = contacts.find(c => c.id === contactId);
        if (!contact) continue;

        // Query mailing_recipients for this contact
        const { data: recipients } = await supabase
          .from("mailing_recipients")
          .select(`
            id,
            status,
            sent_at,
            sender_email_id,
            mailing:mailings (
              id,
              subject,
              created_at,
              status
            )
          `)
          .eq("contact_id", contactId)
          .in("sender_email_id", Array.from(senderEmailIds))
          .neq("status", "failed");

        if (recipients && recipients.length > 0) {
          // Get sender email details
          const { data: senderEmails } = await supabase
            .from("emails")
            .select("id, email")
            .in("id", Array.from(senderEmailIds));

          const mailings = recipients.map(r => ({
            subject: r.mailing?.subject || "Без темы",
            sent_at: r.sent_at || r.mailing?.created_at,
            status: r.status,
            sender_email: senderEmails?.find(e => e.id === r.sender_email_id)?.email || "",
            created_at: r.mailing?.created_at,
          }));

          duplicatesFound.push({
            contact_id: contactId,
            contact_email: contact.email,
            contact_name: contact.name,
            mailings,
          });
        }
      }

      return duplicatesFound;
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload.send_now && (!payload.scheduled_at || !payload.scheduled_time)) {
      return alert("Укажите дату и время отправки или выберите 'Отправить сейчас'");
    }

    // Check for duplicates before creating mailing
    const duplicatesFound = await checkForDuplicates();
    if (duplicatesFound.length > 0) {
      setDuplicates(duplicatesFound);
      setShowDuplicatesModal(true);
      return;
    }

    // Show progress and proceed with mailing creation
    setProgress({ current: 0, total: selectedContacts.length });

    await createMailing(
      { ...payload, selected_contacts: selectedContacts },
      {
        selectedSubgroups,
        selectedContactsFromUI: selectedContacts,
        contacts,
        emails,
        onProgress: (current, total) => {
          setProgress({ current, total });
        },
      }
    );
    onCreated?.();
    onClose();
  };

  const handleEditMailing = () => {
    setShowDuplicatesModal(false);
  };

  const handleExcludeAndContinue = async (excludedIds: string[]) => {
    // Remove excluded contacts from selectedContacts
    const filteredContacts = selectedContacts.filter(id => !excludedIds.includes(id));
    setSelectedContacts(filteredContacts);

    // Close duplicates modal
    setShowDuplicatesModal(false);

    // Show progress and proceed with mailing creation using filtered contacts
    setProgress({ current: 0, total: filteredContacts.length });

    await createMailing(
      { ...payload, selected_contacts: filteredContacts, exclude_contacts: excludedIds },
      {
        selectedSubgroups,
        selectedContactsFromUI: filteredContacts,
        contacts,
        emails,
        excludeContactsOverride: excludedIds,
        onProgress: (current, total) => {
          setProgress({ current, total });
        },
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

  const handleGroupCheck = async (groupId: string, checked: boolean) => {
    setPayload(prev => ({
      ...prev,
      selected_groups: checked
        ? [...prev.selected_groups, groupId]
        : prev.selected_groups.filter(id => id !== groupId)
    }));

    if (checked) {
      const { data: subgroups } = await supabase
        .from("contact_groups")
        .select("id")
        .eq("parent_group_id", groupId);

      if (subgroups && subgroups.length > 0) {
        const subgroupIds = subgroups.map(sg => sg.id);
        setSelectedSubgroups(prev => [...new Set([...prev, ...subgroupIds])]);

        const allContacts: string[] = [];
        for (const subgroup of subgroups) {
          const { data: members } = await supabase
            .from("contact_group_members")
            .select("contact_id")
            .eq("group_id", subgroup.id);

          if (members) {
            allContacts.push(...members.map(m => m.contact_id));
          }
        }

        if (allContacts.length > 0) {
          setSelectedContacts(prev => [...new Set([...prev, ...allContacts])]);
        }
      }
    } else {
      const { data: subgroups } = await supabase
        .from("contact_groups")
        .select("id")
        .eq("parent_group_id", groupId);

      if (subgroups && subgroups.length > 0) {
        const subgroupIds = subgroups.map(sg => sg.id);
        setSelectedSubgroups(prev => prev.filter(id => !subgroupIds.includes(id)));

        const allContacts: string[] = [];
        for (const subgroup of subgroups) {
          const { data: members } = await supabase
            .from("contact_group_members")
            .select("contact_id")
            .eq("group_id", subgroup.id);

          if (members) {
            allContacts.push(...members.map(m => m.contact_id));
          }
        }

        if (allContacts.length > 0) {
          setSelectedContacts(prev => prev.filter(id => !allContacts.includes(id)));
        }
      }
    }
  };

  const handleSubgroupCheck = async (subgroupId: string, checked: boolean) => {
    setSelectedSubgroups(prev =>
      checked ? [...prev, subgroupId] : prev.filter(x => x !== subgroupId)
    );

    if (checked) {
      const { data: members } = await supabase
        .from("contact_group_members")
        .select("contact_id")
        .eq("group_id", subgroupId);

      if (members && members.length > 0) {
        const contactIds = members.map(m => m.contact_id);
        setSelectedContacts(prev => [...new Set([...prev, ...contactIds])]);
      }
    } else {
      const { data: members } = await supabase
        .from("contact_group_members")
        .select("contact_id")
        .eq("group_id", subgroupId);

      if (members && members.length > 0) {
        const contactIds = members.map(m => m.contact_id);
        setSelectedContacts(prev => prev.filter(id => !contactIds.includes(id)));
      }
    }
  };

  const handleContactCheck = async (contactId: string, checked: boolean) => {
    setSelectedContacts(prev =>
      checked ? [...prev, contactId] : prev.filter(x => x !== contactId)
    );

    if (checked) {
      const { data: memberships } = await supabase
        .from("contact_group_members")
        .select("group_id")
        .eq("contact_id", contactId);

      if (memberships && memberships.length > 0) {
        const subgroupIds = memberships.map(m => m.group_id);
        setSelectedSubgroups(prev => [...new Set([...prev, ...subgroupIds])]);
      }
    }
  };

  return !open ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Создать рассылку</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Выбор групп</label>
            {groups.filter(g => !g.parent_group_id).length === 0 ? <div className="p-3 text-sm text-gray-500">Нет групп</div> : (
              <div className="space-y-2">
                {groups.filter(g => !g.parent_group_id).map(g => (
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
                    onCheckChange={(checked) => handleGroupCheck(g.id, checked)}
                    onSubgroupCheck={handleSubgroupCheck}
                    onContactCheck={handleContactCheck}
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

          {loading && progress.total > 0 && (
            <ProgressBar
              current={progress.current}
              total={progress.total}
              label={`Обработка контактов: ${progress.current} из ${progress.total}`}
            />
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg">Отменить</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">{loading ? "Создание..." : "Создать"}</button>
          </div>
        </form>
      </div>

      <DuplicatesModal
        duplicates={duplicates}
        open={showDuplicatesModal}
        onClose={() => setShowDuplicatesModal(false)}
        onEditMailing={handleEditMailing}
        onExcludeAndContinue={handleExcludeAndContinue}
      />
    </div>
  );
}
export default CreateEditModal;
