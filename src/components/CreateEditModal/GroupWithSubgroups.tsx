// src/components/CreateEditModal/GroupWithSubgroups.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ChevronDown, Users } from "lucide-react";
import type { ContactGroup, Contact, Email } from "../../types";

interface Props {
  group: ContactGroup;
  isSelected: boolean;
  isExpanded: boolean;
  emails: Email[];
  selectedSubgroups: string[];
  selectedContacts: string[];
  subgroupEmailOverrides: Record<string, string>;
  expandedSubgroups: Set<string>;
  onToggle: () => void;
  onCheckChange: (checked: boolean) => void;
  onSubgroupCheck: (id: string, checked: boolean) => void;
  onContactCheck: (id: string, checked: boolean) => void;
  onSubgroupToggle: (id: string) => void;
  onEmailOverride: (subgroupId: string, emailId: string) => void;
}

export function GroupWithSubgroups(props: Props) {
  const {
    group,
    isSelected,
    isExpanded,
    emails,
    selectedSubgroups,
    selectedContacts,
    subgroupEmailOverrides,
    expandedSubgroups,
    onToggle,
    onCheckChange,
    onSubgroupCheck,
    onContactCheck,
    onSubgroupToggle,
    onEmailOverride,
  } = props;

  const [subgroups, setSubgroups] = useState<ContactGroup[]>([]);
  const [loadingSubgroups, setLoadingSubgroups] = useState(false);
  const [contactsBySubgroup, setContactsBySubgroup] = useState<Record<string, Contact[]>>({});
  const [loadingContacts, setLoadingContacts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    setLoadingSubgroups(true);
    (async () => {
      const { data } = await supabase.from("contact_groups").select("*").eq("parent_group_id", group.id);
      if (mounted) setSubgroups((data as ContactGroup[]) || []);
      setLoadingSubgroups(false);
    })();
    return () => void (mounted = false);
  }, [group.id]);

  const loadContactsForSubgroup = async (subgroupId: string) => {
    if (contactsBySubgroup[subgroupId]) return;
    setLoadingContacts(prev => ({ ...prev, [subgroupId]: true }));
    const { data } = await supabase
      .from("contact_group_members")
      .select("contact_id, contacts (id, email, name)")
      .eq("group_id", subgroupId);
    const contacts = (data || []).map((r: any) => r.contacts);
    setContactsBySubgroup(prev => ({ ...prev, [subgroupId]: contacts }));
    setLoadingContacts(prev => ({ ...prev, [subgroupId]: false }));
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3">
        <input type="checkbox" checked={isSelected} onChange={(e) => onCheckChange(e.target.checked)} className="w-4 h-4" />
        <button onClick={onToggle} className="flex items-center gap-3 flex-1 text-left">
          <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
          <div>
            <div className="font-medium text-sm">{group.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Группа</div>
          </div>
        </button>
      </div>

      {isExpanded && (
        <div className="p-2 bg-white dark:bg-gray-800">
          {loadingSubgroups ? <div className="p-3 text-sm">Загрузка...</div> : subgroups.length === 0 ? <div className="p-3 text-sm text-gray-500">Нет подгрупп</div> : (
            <div className="space-y-2">
              {subgroups.map((sg) => {
                const isSubExpanded = expandedSubgroups.has(sg.id);
                const contacts = contactsBySubgroup[sg.id] || [];
                const loading = !!loadingContacts[sg.id];
                const isSubChecked = selectedSubgroups.includes(sg.id);
                return (
                  <div key={sg.id} className="border rounded">
                    <div className="p-2 flex items-center gap-2">
                      <input type="checkbox" checked={isSubChecked} onChange={(e) => onSubgroupCheck(sg.id, e.target.checked)} className="w-4 h-4" />
                      <button onClick={() => { onSubgroupToggle(sg.id); if (!isSubExpanded) loadContactsForSubgroup(sg.id); }} className="flex-1 text-left flex items-center gap-2">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isSubExpanded ? "" : "-rotate-90"}`} />
                        <div className="text-sm">{sg.name}</div>
                      </button>

                      <select value={subgroupEmailOverrides[sg.id] || ""} onChange={(e) => onEmailOverride(sg.id, e.target.value)} className="text-xs">
                        <option value="">По умолчанию</option>
                        {emails.map(em => <option key={em.id} value={em.id}>{em.email}</option>)}
                      </select>
                    </div>

                    {isSubExpanded && (
                      <div className="p-2 border-t bg-white dark:bg-gray-800">
                        {loading ? <div className="text-sm">Загрузка контактов...</div> : contacts.length === 0 ? <div className="text-xs text-gray-500">Нет контактов</div> : (
                          <div className="space-y-1">
                            {contacts.map(c => (
                              <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                                <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={(e) => onContactCheck(c.id, e.target.checked)} className="w-3.5 h-3.5" />
                                <Users className="w-3.5 h-3.5" />
                                <span className="text-xs">{c.email}{c.name ? ` (${c.name})` : ""}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default GroupWithSubgroups;
