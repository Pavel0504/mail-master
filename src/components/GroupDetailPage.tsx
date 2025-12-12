import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Users, Mail, Upload, FileText, Edit2, FolderOpen } from 'lucide-react';
import { supabase, ContactGroup, Contact, Email } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface GroupDetailPageProps {
  groupId: string;
  onBack: () => void;
  onOpenSubgroup: (groupId: string) => void;
}

interface SubgroupWithCount extends ContactGroup {
  memberCount: number;
}

interface DuplicateInfo {
  email: string;
  contactId: string;
  groups: Array<{ groupId: string; groupName: string }>;
}

interface BatchResult {
  total: number;
  created: number;
  createdEmails: string[];
}

export function GroupDetailPage({ groupId, onBack, onOpenSubgroup }: GroupDetailPageProps) {
  const { user } = useAuth();
  const [group, setGroup] = useState<ContactGroup | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [subgroups, setSubgroups] = useState<SubgroupWithCount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showAddSubgroupModal, setShowAddSubgroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [showDeleteSubgroupModal, setShowDeleteSubgroupModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [pendingContacts, setPendingContacts] = useState<Array<{ email: string; name: string; link: string; default_sender_email_id: string }>>([]);
  const [subgroupToDelete, setSubgroupToDelete] = useState<SubgroupWithCount | null>(null);
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
  });
  const [editGroupForm, setEditGroupForm] = useState({
    name: '',
    default_sender_email_id: '',
    default_subject: '',
    default_text_content: '',
    default_html_content: '',
  });

  useEffect(() => {
    if (user && groupId) {
      loadData();
    }
  }, [user, groupId]);

  const loadData = async () => {
    await Promise.all([loadGroupData(), loadSubgroups(), loadEmails()]);
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
  };

  const loadSubgroups = async () => {
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

  const checkForDuplicates = async (contactsToCheck: Array<{ email: string; name: string; link: string; default_sender_email_id: string }>) => {
    if (!user) return [];

    const duplicatesFound: DuplicateInfo[] = [];

    for (const contact of contactsToCheck) {
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, owner_id')
        .eq('email', contact.email)
        .eq('owner_id', user.id);

      if (existingContacts && existingContacts.length > 0) {
        const groups: Array<{ groupId: string; groupName: string }> = [];

        for (const existingContact of existingContacts) {
          const { data: memberships } = await supabase
            .from('contact_group_members')
            .select('group_id')
            .eq('contact_id', existingContact.id);

          if (memberships) {
            for (const membership of memberships) {
              const { data: groupData } = await supabase
                .from('contact_groups')
                .select('name')
                .eq('id', membership.group_id)
                .single();

              if (groupData) {
                groups.push({
                  groupId: membership.group_id,
                  groupName: groupData.name,
                });
              }
            }
          }
        }

        if (groups.length > 0) {
          duplicatesFound.push({
            email: contact.email,
            contactId: existingContacts[0].id,
            groups,
          });
        }
      }
    }

    return duplicatesFound;
  };

  const handleAddContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const duplicatesFound = await checkForDuplicates(newContacts.filter(c => c.email));

      if (duplicatesFound.length > 0) {
        setDuplicates(duplicatesFound);
        setPendingContacts(newContacts.filter(c => c.email));
        setShowAddContactModal(false);
        setShowDuplicatesModal(true);
        setLoading(false);
        return;
      }

      await createContacts(newContacts.filter(c => c.email));

      setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
      setShowAddContactModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при добавлении контактов');
    } finally {
      setLoading(false);
    }
  };

  const createContacts = async (contactsToCreate: Array<{ email: string; name: string; link: string; default_sender_email_id: string }>) => {
    if (!user) return;

    for (const contact of contactsToCreate) {
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
  };

  const handleDuplicateAction = async (email: string, action: 'keep' | 'move' | 'duplicate') => {
    if (!user) return;

    const duplicate = duplicates.find(d => d.email === email);
    if (!duplicate) return;

    const contactToAdd = pendingContacts.find(c => c.email === email);
    if (!contactToAdd) return;

    try {
      if (action === 'keep') {
        // Просто удаляем из списка дублей
      } else if (action === 'move') {
        // Удаляем контакт из всех текущих групп
        for (const group of duplicate.groups) {
          await supabase
            .from('contact_group_members')
            .delete()
            .eq('contact_id', duplicate.contactId);
        }

        // Обновляем данные контакта и добавляем в текущую группу
        await supabase
          .from('contacts')
          .update({
            name: contactToAdd.name,
            link: contactToAdd.link,
            default_sender_email_id: contactToAdd.default_sender_email_id || null,
          })
          .eq('id', duplicate.contactId);

        await supabase.from('contact_group_members').insert({
          group_id: groupId,
          contact_id: duplicate.contactId,
        });
      } else if (action === 'duplicate') {
        // Создаем новый контакт
        await createContacts([contactToAdd]);
      }

      // Удаляем из списка дублей
      setDuplicates(prev => prev.filter(d => d.email !== email));
      setPendingContacts(prev => prev.filter(c => c.email !== email));
    } catch (err) {
      console.error('Error handling duplicate:', err);
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

      const contacts: Array<{ email: string; link: string; name: string; default_sender_email_id: string }> = [];
      let currentContact: { email?: string; link?: string; name?: string } = {};
      let lineIndex = 0;

      for (const line of lines) {
        if (line === '') {
          if (currentContact.email && currentContact.link && currentContact.name) {
            contacts.push({
              email: currentContact.email,
              link: currentContact.link,
              name: currentContact.name,
              default_sender_email_id: '',
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
          default_sender_email_id: '',
        });
      }

      if (contacts.length === 0) {
        throw new Error('Не найдено валидных контактов в файле');
      }

      const duplicatesFound = await checkForDuplicates(contacts);

      if (duplicatesFound.length > 0) {
        setDuplicates(duplicatesFound);
        setPendingContacts(contacts);
        setShowBatchModal(false);
        setShowDuplicatesModal(true);
        setBatchProcessing(false);
        return;
      }

      const createdEmails: string[] = [];
      let created = 0;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        setBatchProgress(Math.round(((i + 1) / contacts.length) * 100));

        try {
          await createContacts([contact]);
          createdEmails.push(contact.email);
          created++;
        } catch (err) {
          console.error(`Failed to process contact ${contact.email}:`, err);
        }
      }

      setBatchResult({
        total: contacts.length,
        created,
        createdEmails,
      });

      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при обработке файла');
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleAddSubgroup = async (e: React.FormEvent) => {
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
      });
      setShowAddSubgroupModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании подгруппы');
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !group) return;

    setLoading(true);
    setError('');

    try {
      await supabase
        .from('contact_groups')
        .update({
          name: editGroupForm.name,
          default_sender_email_id: editGroupForm.default_sender_email_id || null,
          default_subject: editGroupForm.default_subject || null,
          default_text_content: editGroupForm.default_text_content || null,
          default_html_content: editGroupForm.default_html_content || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { name: editGroupForm.name },
      });

      setShowEditGroupModal(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании группы');
    } finally {
      setLoading(false);
    }
  };

  const deleteGroupRecursive = async (groupIdToDelete: string) => {
    // Получаем все подгруппы
    const { data: childGroups } = await supabase
      .from('contact_groups')
      .select('id')
      .eq('parent_group_id', groupIdToDelete);

    // Рекурсивно удаляем подгруппы
    if (childGroups) {
      for (const childGroup of childGroups) {
        await deleteGroupRecursive(childGroup.id);
      }
    }

    // Получаем контакты группы
    const { data: members } = await supabase
      .from('contact_group_members')
      .select('contact_id')
      .eq('group_id', groupIdToDelete);

    // Удаляем контакты, которые больше нигде не используются
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

    // Удаляем записи членства группы
    await supabase.from('contact_group_members').delete().eq('group_id', groupIdToDelete);

    // Удаляем саму группу
    await supabase.from('contact_groups').delete().eq('id', groupIdToDelete);
  };

  const handleDeleteGroup = async () => {
    if (!user || !group) return;

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

      setShowDeleteGroupModal(false);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении группы');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubgroup = async () => {
    if (!user || !subgroupToDelete) return;

    setLoading(true);
    try {
      await deleteGroupRecursive(subgroupToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'delete',
        entity_type: 'contact_group',
        entity_id: subgroupToDelete.id,
        details: { name: subgroupToDelete.name },
      });

      setShowDeleteSubgroupModal(false);
      setSubgroupToDelete(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении подгруппы');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('contact_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('contact_id', contactId);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'remove_from_group',
        entity_type: 'contact_group',
        entity_id: groupId,
        details: { contact_id: contactId },
      });

      loadData();
    } catch (err) {
      console.error('Error removing contact:', err);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'text' | 'html',
    targetForm: 'subgroup' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const content = await file.text();

    if (targetForm === 'subgroup') {
      setNewSubgroup((prev) => ({
        ...prev,
        [type === 'text' ? 'default_text_content' : 'default_html_content']: content,
      }));
    } else {
      setEditGroupForm((prev) => ({
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
          Назад
        </button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{group.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">Контактов: {groupContacts.length} | Подгрупп: {subgroups.length}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditGroupForm({
                  name: group.name,
                  default_sender_email_id: group.default_sender_email_id || '',
                  default_subject: group.default_subject || '',
                  default_text_content: group.default_text_content || '',
                  default_html_content: group.default_html_content || '',
                });
                setShowEditGroupModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              <Edit2 className="w-5 h-5" />
              Редактировать группу
            </button>
            <button
              onClick={() => setShowDeleteGroupModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Удалить группу
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowBatchModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Upload className="w-5 h-5" />
            Пакетное создание
          </button>
          <button
            onClick={() => setShowAddSubgroupModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Создать подгруппу
          </button>
          <button
            onClick={() => setShowAddContactModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Добавить контакты
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Контакты слева */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Контакты группы ({groupContacts.length})
          </h2>
          {groupContacts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
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
                    <button
                      onClick={() => handleRemoveContact(contact.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Удалить из группы"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Подгруппы справа */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Подгруппы ({subgroups.length})
          </h2>
          {subgroups.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
              <FolderOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Нет подгрупп</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subgroups.map((subgroup) => (
                <div
                  key={subgroup.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer"
                  onClick={() => onOpenSubgroup(subgroup.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderOpen className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <h3 className="font-medium text-gray-900 dark:text-white text-sm">{subgroup.name}</h3>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Контактов: {subgroup.memberCount}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubgroupToDelete(subgroup);
                        setShowDeleteSubgroupModal(true);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Удалить подгруппу"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модалка добавления контактов */}
      {showAddContactModal && (
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
                    setShowAddContactModal(false);
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

      {/* Модалка создания подгруппы */}
      {showAddSubgroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Создать подгруппу</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddSubgroup} className="space-y-4">
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
                      onChange={(e) => handleFileUpload(e, 'text', 'subgroup')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={newSubgroup.default_text_content}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_text_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="Текстовое содержимое письма"
                  rows={4}
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
                      onChange={(e) => handleFileUpload(e, 'html', 'subgroup')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={newSubgroup.default_html_content}
                  onChange={(e) => setNewSubgroup({ ...newSubgroup, default_html_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="HTML содержимое письма"
                  rows={4}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSubgroupModal(false);
                    setNewSubgroup({
                      name: '',
                      default_sender_email_id: '',
                      default_subject: '',
                      default_text_content: '',
                      default_html_content: '',
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
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка редактирования группы */}
      {showEditGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Редактировать группу</h2>

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
                  value={editGroupForm.name}
                  onChange={(e) => setEditGroupForm({ ...editGroupForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта по умолчанию
                </label>
                <select
                  value={editGroupForm.default_sender_email_id}
                  onChange={(e) => setEditGroupForm({ ...editGroupForm, default_sender_email_id: e.target.value })}
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
                  value={editGroupForm.default_subject}
                  onChange={(e) => setEditGroupForm({ ...editGroupForm, default_subject: e.target.value })}
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
                      onChange={(e) => handleFileUpload(e, 'text', 'edit')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={editGroupForm.default_text_content}
                  onChange={(e) => setEditGroupForm({ ...editGroupForm, default_text_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  rows={4}
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
                      onChange={(e) => handleFileUpload(e, 'html', 'edit')}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={editGroupForm.default_html_content}
                  onChange={(e) => setEditGroupForm({ ...editGroupForm, default_html_content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white font-mono text-sm"
                  rows={4}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditGroupModal(false);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка удаления группы */}
      {showDeleteGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить группу?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Вы уверены, что хотите удалить группу <strong>{group.name}</strong>?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6">
              Будут удалены все подгруппы и контакты, которые есть только в этой группе и её подгруппах. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteGroupModal(false)}
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

      {/* Модалка удаления подгруппы */}
      {showDeleteSubgroupModal && subgroupToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить подгруппу?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Вы уверены, что хотите удалить подгруппу <strong>{subgroupToDelete.name}</strong>?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-6">
              Будут удалены все вложенные подгруппы и контакты, которые есть только в этой подгруппе. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteSubgroupModal(false);
                  setSubgroupToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteSubgroup}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
              >
                {loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка дублей */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Обнаружены дубликаты</h2>

            {duplicates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">Все дубликаты обработаны</p>
                <button
                  onClick={() => {
                    setShowDuplicatesModal(false);
                    setDuplicates([]);
                    setPendingContacts([]);
                    loadData();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {duplicates.map((dup, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {dup.email}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Этот контакт уже существует в следующих группах:
                    </p>
                    <ul className="list-disc list-inside mb-4 space-y-1">
                      {dup.groups.map((group, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                          {group.groupName}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleDuplicateAction(dup.email, 'keep')}
                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                      >
                        Оставить там
                      </button>
                      <button
                        onClick={() => handleDuplicateAction(dup.email, 'move')}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                      >
                        Переместить сюда
                      </button>
                      <button
                        onClick={() => handleDuplicateAction(dup.email, 'duplicate')}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                      >
                        Создать дубликат
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка пакетной загрузки */}
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
    </div>
  );
}
