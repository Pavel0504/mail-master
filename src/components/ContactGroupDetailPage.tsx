import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Users, Mail, Upload, FileText, Edit2, FolderOpen, AlertTriangle, X } from 'lucide-react';
import { supabase, ContactGroup, Contact, Email } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ContactGroupDetailPageProps {
  groupId: string;
  onBack: () => void;
  onOpenSubgroup: (groupId: string) => void;
}

interface BatchResult {
  total: number;
  created: number;
  createdEmails: string[];
}

interface SubgroupWithCount extends ContactGroup {
  memberCount: number;
}

interface DuplicateContact {
  email: string;
  contactId: string;
  existingGroups: Array<{ groupId: string; groupName: string }>;
  newContactData?: { name: string; link: string; default_sender_email_id: string };
}

export function ContactGroupDetailPage({ groupId, onBack, onOpenSubgroup }: ContactGroupDetailPageProps) {
  const { user } = useAuth();
  const [group, setGroup] = useState<ContactGroup | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [subgroups, setSubgroups] = useState<SubgroupWithCount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSubgroupModal, setShowSubgroupModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showEditContactModal, setShowEditContactModal] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateContact[]>([]);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const [newContacts, setNewContacts] = useState([{ email: '', name: '', link: '', default_sender_email_id: '' }]);

  const [newSubgroup, setNewSubgroup] = useState({
    name: '',
    default_sender_email_id: '',
    default_subject: '',
    default_text_content: '',
    default_html_content: '',
    ping_subject: '',
    ping_text_content: '',
    ping_html_content: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    default_sender_email_id: '',
    default_subject: '',
    default_text_content: '',
    default_html_content: '',
    ping_subject: '',
    ping_text_content: '',
    ping_html_content: '',
  });

  const [editContactForm, setEditContactForm] = useState({
    email: '',
    name: '',
    link: '',
    default_sender_email_id: '',
  });

  useEffect(() => {
    if (user && groupId) {
      loadGroupData();
      loadEmails();
    }
  }, [user, groupId]);

  const loadEmails = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (data) {
      setEmails(data);
    }
  };

  const loadGroupData = async () => {
    const { data: groupData } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupData) {
      setGroup(groupData);
    }

    const { data: membersData } = await supabase
      .from('contact_group_members')
      .select('contact_id')
      .eq('group_id', groupId);

    if (membersData) {
      const contactIds = membersData.map((m) => m.contact_id);
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('*')
          .in('id', contactIds)
          .order('created_at', { ascending: false });

        if (contactsData) {
          setGroupContacts(contactsData);
        }
      } else {
        setGroupContacts([]);
      }
    }

    const { data: subgroupsData } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('parent_group_id', groupId)
      .order('created_at', { ascending: false });

    if (subgroupsData) {
      const subgroupsWithCounts = await Promise.all(
        subgroupsData.map(async (subgroup) => {
          const { count } = await supabase
            .from('contact_group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', subgroup.id);

          return {
            ...subgroup,
            memberCount: count || 0,
          };
        })
      );

      setSubgroups(subgroupsWithCounts);
    }
  };

  const checkForDuplicates = async (contactsToAdd: Array<{ email: string; name: string; link: string; default_sender_email_id: string }>) => {
    if (!user) return [];

    const foundDuplicates: DuplicateContact[] = [];

    for (const contact of contactsToAdd) {
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('email', contact.email)
        .eq('owner_id', user.id);

      if (existingContacts && existingContacts.length > 0) {
        const contactId = existingContacts[0].id;

        const { data: memberships } = await supabase
          .from('contact_group_members')
          .select('group_id')
          .eq('contact_id', contactId);

        if (memberships && memberships.length > 0) {
          const groupIds = memberships.map((m) => m.group_id);
          const { data: groups } = await supabase
            .from('contact_groups')
            .select('id, name')
            .in('id', groupIds);

          if (groups) {
            foundDuplicates.push({
              email: contact.email,
              contactId,
              existingGroups: groups.map((g) => ({ groupId: g.id, groupName: g.name })),
              newContactData: { name: contact.name, link: contact.link, default_sender_email_id: contact.default_sender_email_id },
            });
          }
        }
      }
    }

    return foundDuplicates;
  };

  const handleDuplicateAction = async (duplicate: DuplicateContact, action: 'keep' | 'move' | 'duplicate') => {
    if (!user) return;

    try {
      if (action === 'keep') {
        // Создаем новый уникальный контакт с данными, которые пользователь указал
        if (duplicate.newContactData) {
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({
              email: duplicate.email,
              name: duplicate.newContactData.name,
              link: duplicate.newContactData.link,
              owner_id: user.id,
              default_sender_email_id: duplicate.newContactData.default_sender_email_id || null,
              has_changes: false,
            })
            .select()
            .single();

          if (newContact) {
            await supabase.from('contact_group_members').insert({
              group_id: groupId,
              contact_id: newContact.id,
            });

            await supabase.from('activity_logs').insert({
              user_id: user.id,
              action_type: 'create',
              entity_type: 'contact',
              entity_id: newContact.id,
              details: { email: duplicate.email, group_id: groupId },
            });
          }
        }
      } else if (action === 'move') {
        for (const existingGroup of duplicate.existingGroups) {
          await supabase
            .from('contact_group_members')
            .delete()
            .eq('group_id', existingGroup.groupId)
            .eq('contact_id', duplicate.contactId);
        }

        await supabase.from('contact_group_members').insert({
          group_id: groupId,
          contact_id: duplicate.contactId,
        });
      } else if (action === 'duplicate') {
        // Создаем копию существующего контакта со всеми его данными
        const { data: originalContact } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', duplicate.contactId)
          .single();

        if (originalContact) {
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({
              email: originalContact.email,
              name: originalContact.name,
              link: originalContact.link,
              owner_id: user.id,
              default_sender_email_id: originalContact.default_sender_email_id,
              has_changes: false,
            })
            .select()
            .single();

          if (newContact) {
            await supabase.from('contact_group_members').insert({
              group_id: groupId,
              contact_id: newContact.id,
            });

            await supabase.from('activity_logs').insert({
              user_id: user.id,
              action_type: 'create',
              entity_type: 'contact',
              entity_id: newContact.id,
              details: { email: duplicate.email, group_id: groupId, duplicated_from: duplicate.contactId },
            });
          }
        }
      }

      const remainingDuplicates = duplicates.filter((d) => d.email !== duplicate.email);
      setDuplicates(remainingDuplicates);

      if (remainingDuplicates.length === 0) {
        setShowDuplicatesModal(false);
        setShowAddModal(false);
        setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
      }

      loadGroupData();
    } catch (err) {
      console.error('Error handling duplicate:', err);
    }
  };

  const handleAddContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const foundDuplicates = await checkForDuplicates(newContacts);

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setShowDuplicatesModal(true);
        setLoading(false);
        return;
      }

      for (const contact of newContacts) {
        if (!contact.email) continue;

        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            email: contact.email,
            name: contact.name,
            link: contact.link,
            owner_id: user.id,
            default_sender_email_id: contact.default_sender_email_id || null,
            has_changes: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (newContact) {
          await supabase.from('contact_group_members').insert({
            group_id: groupId,
            contact_id: newContact.id,
          });

          await supabase.from('activity_logs').insert({
            user_id: user.id,
            action_type: 'create',
            entity_type: 'contact',
            entity_id: newContact.id,
            details: { email: contact.email, group_id: groupId },
          });
        }
      }

      setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
      setShowAddModal(false);
      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при добавлении контактов');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubgroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase.from('contact_groups').insert({
        name: newSubgroup.name,
        user_id: user.id,
        parent_group_id: groupId,
        default_sender_email_id: newSubgroup.default_sender_email_id || null,
        default_subject: newSubgroup.default_subject || null,
        default_text_content: newSubgroup.default_text_content || null,
        default_html_content: newSubgroup.default_html_content || null,
        ping_subject: newSubgroup.ping_subject || null,
        ping_text_content: newSubgroup.ping_text_content || null,
        ping_html_content: newSubgroup.ping_html_content || null,
      });

      if (insertError) throw insertError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'create',
        entity_type: 'contact_group',
        entity_id: null,
        details: { name: newSubgroup.name, parent_group_id: groupId },
      });

      setNewSubgroup({
        name: '',
        default_sender_email_id: '',
        default_subject: '',
        default_text_content: '',
        default_html_content: '',
        ping_subject: '',
        ping_text_content: '',
        ping_html_content: '',
      });
      setShowSubgroupModal(false);
      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании подгруппы');
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || !user) return;

    setLoading(true);
    setError('');

    try {
      const updateData: Record<string, unknown> = {
        name: editForm.name,
        updated_at: new Date().toISOString(),
      };

      if (group.parent_group_id) {
        updateData.default_sender_email_id = editForm.default_sender_email_id || null;
        updateData.default_subject = editForm.default_subject || null;
        updateData.default_text_content = editForm.default_text_content || null;
        updateData.default_html_content = editForm.default_html_content || null;
        updateData.ping_subject = editForm.ping_subject || null;
        updateData.ping_text_content = editForm.ping_text_content || null;
        updateData.ping_html_content = editForm.ping_html_content || null;
      }

      await supabase
        .from('contact_groups')
        .update(updateData)
        .eq('id', groupId);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { name: editForm.name },
      });

      setShowEditModal(false);
      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании группы');
    } finally {
      setLoading(false);
    }
  };

  const deleteGroupRecursive = async (groupIdToDelete: string) => {
    const { data: subgroups } = await supabase
      .from('contact_groups')
      .select('id')
      .eq('parent_group_id', groupIdToDelete);

    if (subgroups) {
      for (const subgroup of subgroups) {
        await deleteGroupRecursive(subgroup.id);
      }
    }

    const { data: members } = await supabase
      .from('contact_group_members')
      .select('contact_id')
      .eq('group_id', groupIdToDelete);

    if (members) {
      for (const member of members) {
        const { data: otherMemberships } = await supabase
          .from('contact_group_members')
          .select('id')
          .eq('contact_id', member.contact_id)
          .neq('group_id', groupIdToDelete);

        if (!otherMemberships || otherMemberships.length === 0) {
          await supabase.from('contact_history').delete().eq('contact_id', member.contact_id);
          await supabase.from('contacts').delete().eq('id', member.contact_id);
        }
      }
    }

    await supabase.from('contact_group_members').delete().eq('group_id', groupIdToDelete);
    await supabase.from('contact_groups').delete().eq('id', groupIdToDelete);
  };

  const handleDeleteGroup = async () => {
    if (!group || !user) return;

    setLoading(true);
    try {
      await deleteGroupRecursive(groupId);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'delete',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { name: group.name },
      });

      setShowDeleteModal(false);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении группы');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchResult(null);
    setError('');

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim());

      const contacts: Array<{ email: string; link: string; name: string }> = [];
      let currentContact: { email?: string; link?: string; name?: string } = {};
      let lineIndex = 0;

      for (const line of lines) {
        if (line === '') {
          if (currentContact.email && currentContact.link && currentContact.name) {
            contacts.push({
              email: currentContact.email,
              link: currentContact.link,
              name: currentContact.name,
            });
          }
          currentContact = {};
          lineIndex = 0;
        } else {
          if (lineIndex === 0) {
            currentContact.email = line;
          } else if (lineIndex === 1) {
            currentContact.link = line;
          } else if (lineIndex === 2) {
            currentContact.name = line;
          }
          lineIndex++;
        }
      }

      if (currentContact.email && currentContact.link && currentContact.name) {
        contacts.push({
          email: currentContact.email,
          link: currentContact.link,
          name: currentContact.name,
        });
      }

      if (contacts.length === 0) {
        throw new Error('Не найдено валидных контактов в файле');
      }

      const createdEmails: string[] = [];
      let created = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        setBatchProgress(Math.round(((i + 1) / contacts.length) * 100));

        try {
          const { data: existingContacts } = await supabase
            .from('contacts')
            .select('id, owner_id')
            .eq('email', contact.email);

          const myContact = existingContacts?.find(c => c.owner_id === user.id);

          if (myContact) {
            const { data: existingMember } = await supabase
              .from('contact_group_members')
              .select('id')
              .eq('group_id', groupId)
              .eq('contact_id', myContact.id)
              .maybeSingle();

            if (!existingMember) {
              await supabase.from('contact_group_members').insert({
                group_id: groupId,
                contact_id: myContact.id,
              });
            }
            continue;
          }

          const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert({
              email: contact.email,
              name: contact.name,
              link: contact.link,
              owner_id: user.id,
              has_changes: false,
            })
            .select()
            .single();

          if (insertError) {
            console.error(`Error creating contact ${contact.email}:`, insertError);
            continue;
          }

          if (newContact) {
            await supabase.from('contact_group_members').insert({
              group_id: groupId,
              contact_id: newContact.id,
            });

            createdEmails.push(contact.email);
            created++;

            await supabase.from('activity_logs').insert({
              user_id: user.id,
              action_type: 'create',
              entity_type: 'contact',
              entity_id: newContact.id,
              details: { email: contact.email, group_id: groupId, batch_import: true },
            });
          }
        } catch (err) {
          console.error(`Failed to process contact ${contact.email}:`, err);
        }
      }

      setBatchResult({
        total: contacts.length,
        created,
        createdEmails,
      });

      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при обработке файла');
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!user) return;

    try {
      // Удаляем контакт из текущей группы
      await supabase
        .from('contact_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('contact_id', contactId);

      // Проверяем, есть ли контакт в других группах
      const { data: otherMemberships } = await supabase
        .from('contact_group_members')
        .select('id')
        .eq('contact_id', contactId);

      // Если контакта больше нет ни в одной группе - удаляем его полностью
      if (!otherMemberships || otherMemberships.length === 0) {
        await supabase.from('contact_history').delete().eq('contact_id', contactId);
        await supabase.from('contacts').delete().eq('id', contactId);
      }

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'remove_from_group',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { contact_id: contactId },
      });

      loadGroupData();
    } catch (err) {
      console.error('Error removing contact:', err);
    }
  };

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactToEdit || !user) return;

    setLoading(true);
    setError('');

    try {
      const changedFields: Record<string, unknown> = {};
      if (editContactForm.email !== contactToEdit.email) changedFields.email = editContactForm.email;
      if (editContactForm.name !== contactToEdit.name) changedFields.name = editContactForm.name;
      if (editContactForm.link !== contactToEdit.link) changedFields.link = editContactForm.link;
      if (editContactForm.default_sender_email_id !== (contactToEdit.default_sender_email_id || '')) {
        changedFields.default_sender_email_id = editContactForm.default_sender_email_id || null;
      }

      await supabase
        .from('contacts')
        .update({
          email: editContactForm.email,
          name: editContactForm.name,
          link: editContactForm.link,
          default_sender_email_id: editContactForm.default_sender_email_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactToEdit.id);

      if (Object.keys(changedFields).length > 0) {
        await supabase.from('contact_history').insert({
          contact_id: contactToEdit.id,
          action_type: 'update',
          changed_fields: changedFields,
          changed_by: user.id,
        });
      }

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'contact',
        entity_id: contactToEdit.id,
        details: { changes: changedFields, group_id: groupId },
      });

      setShowEditContactModal(false);
      setContactToEdit(null);
      loadGroupData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании контакта');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'text' | 'html',
    isEdit: boolean = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    if (isEdit) {
      setEditForm((prev) => ({
        ...prev,
        [type === 'text' ? 'default_text_content' : 'default_html_content']: content,
      }));
    } else {
      setNewSubgroup((prev) => ({
        ...prev,
        [type === 'text' ? 'default_text_content' : 'default_html_content']: content,
      }));
    }
  };

  if (!group) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад к группам
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{group.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Контактов: {groupContacts.length} | Подгрупп: {subgroups.length}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditForm({
                  name: group.name,
                  default_sender_email_id: group.default_sender_email_id || '',
                  default_subject: group.default_subject || '',
                  default_text_content: group.default_text_content || '',
                  default_html_content: group.default_html_content || '',
                  ping_subject: group.ping_subject || '',
                  ping_text_content: group.ping_text_content || '',
                  ping_html_content: group.ping_html_content || '',
                });
                setShowEditModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              <Edit2 className="w-5 h-5" />
              Редактировать
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Удалить
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!group.parent_group_id && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                Подгруппы
              </h2>
              <button
                onClick={() => setShowSubgroupModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Создать подгруппу
              </button>
            </div>

            {subgroups.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                <FolderOpen className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Нет подгрупп</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subgroups.map((subgroup) => (
                  <div
                    key={subgroup.id}
                    onClick={() => onOpenSubgroup(subgroup.id)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white text-sm">{subgroup.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Контактов: {subgroup.memberCount}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {group.parent_group_id && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                Контакты
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Пакетное
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </div>

            {groupContacts.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                <Users className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Нет контактов</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <h3 className="font-medium text-gray-900 dark:text-white text-sm">{contact.email}</h3>
                        </div>
                        {contact.name && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">Имя: {contact.name}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setContactToEdit(contact);
                            setEditContactForm({
                              email: contact.email,
                              name: contact.name,
                              link: contact.link,
                              default_sender_email_id: contact.default_sender_email_id || '',
                            });
                            setShowEditContactModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title="Редактировать"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveContact(contact.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!group.parent_group_id && subgroups.length === 0 && (
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-center">
          <FolderOpen className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Создайте подгруппы для организации контактов
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Родительские группы содержат подгруппы. Контакты добавляются в подгруппы.
          </p>
          <button
            onClick={() => setShowSubgroupModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Создать первую подгруппу
          </button>
        </div>
      )}


      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Добавить контакты</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddContacts} className="space-y-4">
              {newContacts.map((contact, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Контакт {index + 1}</h3>
                    {newContacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewContacts(newContacts.filter((_, i) => i !== index))}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].email = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="example@mail.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Имя <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].name = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="Имя контакта"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ссылка <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="url"
                      value={contact.link}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].link = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Почта по умолчанию
                    </label>
                    <select
                      value={contact.default_sender_email_id}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].default_sender_email_id = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    >
                      <option value="">Не выбрано</option>
                      {emails.map((email) => (
                        <option key={email.id} value={email.id}>
                          {email.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setNewContacts([...newContacts, { email: '', name: '', link: '', default_sender_email_id: '' }])}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                + Добавить еще контакт
              </button>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Добавление...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubgroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Создать подгруппу</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleCreateSubgroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newSubgroup.name}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Название подгруппы"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта по умолчанию
                </label>
                <select
                  value={newSubgroup.default_sender_email_id}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_sender_email_id: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                >
                  <option value="">Не выбрано</option>
                  {emails.map((email) => (
                    <option key={email.id} value={email.id}>
                      {email.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Тема письма по умолчанию
                </label>
                <input
                  type="text"
                  value={newSubgroup.default_subject}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_subject: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Тема письма"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Текст письма
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    Загрузить .txt
                    <input
                      type="file"
                      accept=".txt"
                      onChange={(e) => handleFileUpload(e, 'text')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={newSubgroup.default_text_content}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_text_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="Текстовое содержимое"
                  rows={3}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    HTML письма
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    Загрузить .html
                    <input
                      type="file"
                      accept=".html"
                      onChange={(e) => handleFileUpload(e, 'html')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={newSubgroup.default_html_content}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_html_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="HTML содержимое"
                  rows={3}
                />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Пинг-письмо</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Тема письма для пинга
                    </label>
                    <input
                      type="text"
                      value={newSubgroup.ping_subject}
                      onChange={(e) => setNewSubgroup({ ...newSubgroup, ping_subject: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="Тема пинг-письма"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Текст для пинга
                    </label>
                    <textarea
                      value={newSubgroup.ping_text_content}
                      onChange={(e) => setNewSubgroup({ ...newSubgroup, ping_text_content: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                      placeholder="Текст пинг-письма"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      HTML для пинга
                    </label>
                    <textarea
                      value={newSubgroup.ping_html_content}
                      onChange={(e) => setNewSubgroup({ ...newSubgroup, ping_html_content: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                      placeholder="HTML пинг-письма"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubgroupModal(false);
                    setNewSubgroup({
                      name: '',
                      default_sender_email_id: '',
                      default_subject: '',
                      default_text_content: '',
                      default_html_content: '',
                      ping_subject: '',
                      ping_text_content: '',
                      ping_html_content: '',
                    });
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {group.parent_group_id ? 'Редактировать подгруппу' : 'Редактировать группу'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleEditGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              {group.parent_group_id && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Почта по умолчанию
                    </label>
                    <select
                      value={editForm.default_sender_email_id}
                      onChange={(e) => setEditForm({ ...editForm, default_sender_email_id: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    >
                      <option value="">Не выбрано</option>
                      {emails.map((email) => (
                        <option key={email.id} value={email.id}>
                          {email.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Тема письма по умолчанию
                    </label>
                    <input
                      type="text"
                      value={editForm.default_subject}
                      onChange={(e) => setEditForm({ ...editForm, default_subject: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Текст письма
                      </label>
                      <label className="flex items-center gap-2 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors">
                        <Upload className="w-4 h-4" />
                        Загрузить .txt
                        <input
                          type="file"
                          accept=".txt"
                          onChange={(e) => handleFileUpload(e, 'text', true)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <textarea
                      value={editForm.default_text_content}
                      onChange={(e) => setEditForm({ ...editForm, default_text_content: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                      rows={3}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        HTML письма
                      </label>
                      <label className="flex items-center gap-2 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors">
                        <Upload className="w-4 h-4" />
                        Загрузить .html
                        <input
                          type="file"
                          accept=".html"
                          onChange={(e) => handleFileUpload(e, 'html', true)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <textarea
                      value={editForm.default_html_content}
                      onChange={(e) => setEditForm({ ...editForm, default_html_content: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                      rows={3}
                    />
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Пинг-письмо</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Тема письма для пинга
                        </label>
                        <input
                          type="text"
                          value={editForm.ping_subject}
                          onChange={(e) => setEditForm({ ...editForm, ping_subject: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                          placeholder="Тема пинг-письма"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Текст для пинга
                        </label>
                        <textarea
                          value={editForm.ping_text_content}
                          onChange={(e) => setEditForm({ ...editForm, ping_text_content: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                          placeholder="Текст пинг-письма"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          HTML для пинга
                        </label>
                        <textarea
                          value={editForm.ping_html_content}
                          onChange={(e) => setEditForm({ ...editForm, ping_html_content: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                          placeholder="HTML пинг-письма"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Удалить группу?</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Вы уверены, что хотите удалить группу <strong>{group.name}</strong>?
            </p>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-600 dark:text-red-400">
                Это действие удалит все подгруппы и контакты, которые есть только в этой группе. Операция необратима.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteGroup}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
              >
                {loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicatesModal && duplicates.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Обнаружены дубликаты</h2>

            <div className="space-y-4">
              {duplicates.map((dup) => (
                <div key={dup.email} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{dup.email}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Контакт уже существует в группах:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 mb-4 space-y-1">
                    {dup.existingGroups.map((group) => (
                      <li key={group.groupId}>{group.groupName}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDuplicateAction(dup, 'keep')}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                    >
                      Оставить в обеих
                    </button>
                    <button
                      onClick={() => handleDuplicateAction(dup, 'move')}
                      className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors text-sm"
                    >
                      Переместить сюда
                    </button>
                    <button
                      onClick={() => handleDuplicateAction(dup, 'duplicate')}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                    >
                      Создать копию
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowDuplicatesModal(false);
                setDuplicates([]);
                setShowAddModal(false);
                setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
              }}
              className="mt-6 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Пакетное создание контактов</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {!batchProcessing && !batchResult && (
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Формат файла
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <p>Загрузите текстовый файл (.txt) со следующей структурой:</p>
                    <pre className="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 font-mono text-xs">
email@example.com{'\n'}https://example.com{'\n'}Имя контакта{'\n'}{'\n'}email2@example.com{'\n'}https://example2.com{'\n'}Имя контакта 2
                    </pre>
                    <p className="text-xs">Пустая строка разделяет контакты</p>
                  </div>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Нажмите для загрузки файла .txt
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleBatchUpload}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
              </div>
            )}

            {batchProcessing && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-gray-900 dark:text-white mb-4">Обработка контактов...</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                    <div
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{batchProgress}%</p>
                </div>
              </div>
            )}

            {batchResult && (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Результат импорта</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Создано <strong>{batchResult.created}</strong> из <strong>{batchResult.total}</strong> контактов
                  </p>
                </div>

                {batchResult.createdEmails.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Созданные контакты:</h4>
                    <div className="max-h-64 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                      {batchResult.createdEmails.map((email, index) => (
                        <div
                          key={index}
                          className="text-sm text-gray-700 dark:text-gray-300 py-1 px-2 bg-white dark:bg-gray-700 rounded"
                        >
                          {email}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowBatchModal(false);
                    setBatchResult(null);
                    setBatchProgress(0);
                    setError('');
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showEditContactModal && contactToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Редактировать контакт</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleEditContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  value={editContactForm.email}
                  onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Имя <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={editContactForm.name}
                  onChange={(e) => setEditContactForm({ ...editContactForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ссылка <span className="text-red-600">*</span>
                </label>
                <input
                  type="url"
                  value={editContactForm.link}
                  onChange={(e) => setEditContactForm({ ...editContactForm, link: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта по умолчанию
                </label>
                <select
                  value={editContactForm.default_sender_email_id}
                  onChange={(e) => setEditContactForm({ ...editContactForm, default_sender_email_id: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                >
                  <option value="">Не выбрано</option>
                  {emails.map((email) => (
                    <option key={email.id} value={email.id}>
                      {email.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditContactModal(false);
                    setContactToEdit(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
