import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, FolderOpen, Mail, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase, ContactGroup, Contact, Email } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface GroupWithRelations extends ContactGroup {
  memberCount: number;
  subgroups?: GroupWithRelations[];
  senderEmail?: Email;
}

interface DuplicateInfo {
  email: string;
  contactId: string;
  groups: Array<{ groupId: string; groupName: string; groupPath: string }>;
}

export function HierarchicalGroupsPage() {
  const { user } = useAuth();
  const [rootGroups, setRootGroups] = useState<GroupWithRelations[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState<Email[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [groupToEdit, setGroupToEdit] = useState<ContactGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<GroupWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [newGroup, setNewGroup] = useState({
    name: '',
    parent_group_id: null as string | null,
    default_sender_email_id: '',
    default_subject: '',
    default_text_content: '',
    default_html_content: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    default_sender_email_id: '',
    default_subject: '',
    default_text_content: '',
    default_html_content: '',
  });

  useEffect(() => {
    if (user) {
      loadGroups();
      loadEmails();
      checkDuplicates();
    }
  }, [user]);

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

  const loadGroups = async () => {
    if (!user) return;

    const { data: groupsData } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (groupsData) {
      const { data: emailsData } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id);

      const groupsWithCounts = await Promise.all(
        groupsData.map(async (group) => {
          const { count } = await supabase
            .from('contact_group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);

          return {
            ...group,
            memberCount: count || 0,
            senderEmail: emailsData?.find((e) => e.id === group.default_sender_email_id),
          };
        })
      );

      const hierarchical = buildHierarchy(groupsWithCounts);
      setRootGroups(hierarchical);
    }
  };

  const buildHierarchy = (groups: GroupWithRelations[]): GroupWithRelations[] => {
    const rootGroups = groups.filter((g) => !g.parent_group_id);
    const attachChildren = (parentId: string): GroupWithRelations[] => {
      return groups.filter((g) => g.parent_group_id === parentId).map((g) => ({
        ...g,
        subgroups: attachChildren(g.id),
      }));
    };

    return rootGroups.map((g) => ({
      ...g,
      subgroups: attachChildren(g.id),
    }));
  };

  const checkDuplicates = async () => {
    if (!user) return;

    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, email, owner_id')
      .eq('owner_id', user.id);

    if (!allContacts) return;

    const emailMap = new Map<string, string[]>();
    allContacts.forEach((contact) => {
      const existing = emailMap.get(contact.email) || [];
      existing.push(contact.id);
      emailMap.set(contact.email, existing);
    });

    const duplicateEmails = Array.from(emailMap.entries()).filter(([_, ids]) => ids.length > 1);

    const duplicateInfos: DuplicateInfo[] = [];

    for (const [email, contactIds] of duplicateEmails) {
      const groups: Array<{ groupId: string; groupName: string; groupPath: string }> = [];

      for (const contactId of contactIds) {
        const { data: memberships } = await supabase
          .from('contact_group_members')
          .select('group_id')
          .eq('contact_id', contactId);

        if (memberships) {
          for (const membership of memberships) {
            const { data: group } = await supabase
              .from('contact_groups')
              .select('*')
              .eq('id', membership.group_id)
              .single();

            if (group) {
              const path = await getGroupPath(group);
              groups.push({
                groupId: group.id,
                groupName: group.name,
                groupPath: path,
              });
            }
          }
        }
      }

      if (groups.length > 1) {
        duplicateInfos.push({ email, contactId: contactIds[0], groups });
      }
    }

    setDuplicates(duplicateInfos);
  };

  const getGroupPath = async (group: ContactGroup): Promise<string> => {
    const path: string[] = [group.name];
    let currentGroup = group;

    while (currentGroup.parent_group_id) {
      const { data: parentGroup } = await supabase
        .from('contact_groups')
        .select('*')
        .eq('id', currentGroup.parent_group_id)
        .single();

      if (parentGroup) {
        path.unshift(parentGroup.name);
        currentGroup = parentGroup;
      } else {
        break;
      }
    }

    return path.join(' → ');
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase.from('contact_groups').insert({
        name: newGroup.name,
        user_id: user.id,
        parent_group_id: newGroup.parent_group_id,
        default_sender_email_id: newGroup.default_sender_email_id || null,
        default_subject: newGroup.default_subject || null,
        default_text_content: newGroup.default_text_content || null,
        default_html_content: newGroup.default_html_content || null,
      });

      if (insertError) throw insertError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'create',
        entity_type: 'contact_group',
        entity_id: null,
        details: { name: newGroup.name, parent_group_id: newGroup.parent_group_id },
      });

      setNewGroup({
        name: '',
        parent_group_id: null,
        default_sender_email_id: '',
        default_subject: '',
        default_text_content: '',
        default_html_content: '',
      });
      setShowAddModal(false);
      loadGroups();
      checkDuplicates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании группы');
    } finally {
      setLoading(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToEdit || !user) return;

    setLoading(true);
    setError('');

    try {
      await supabase
        .from('contact_groups')
        .update({
          name: editForm.name,
          default_sender_email_id: editForm.default_sender_email_id || null,
          default_subject: editForm.default_subject || null,
          default_text_content: editForm.default_text_content || null,
          default_html_content: editForm.default_html_content || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupToEdit.id);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'contact_group',
        entity_id: groupToEdit.id,
        details: { name: editForm.name },
      });

      setShowEditModal(false);
      setGroupToEdit(null);
      loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании группы');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete || !user) return;

    setLoading(true);
    try {
      const { data: members } = await supabase
        .from('contact_group_members')
        .select('contact_id')
        .eq('group_id', groupToDelete.id);

      if (members) {
        for (const member of members) {
          const { data: otherMemberships } = await supabase
            .from('contact_group_members')
            .select('id')
            .eq('contact_id', member.contact_id)
            .neq('group_id', groupToDelete.id);

          if (!otherMemberships || otherMemberships.length === 0) {
            await supabase.from('contact_history').delete().eq('contact_id', member.contact_id);
            await supabase.from('contacts').delete().eq('id', member.contact_id);
          }
        }
      }

      await supabase.from('contact_group_members').delete().eq('group_id', groupToDelete.id);
      await supabase.from('contact_groups').delete().eq('id', groupToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'delete',
        entity_type: 'contact_group',
        entity_id: groupToDelete.id,
        details: { name: groupToDelete.name },
      });

      setShowDeleteModal(false);
      setGroupToDelete(null);
      loadGroups();
      checkDuplicates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении группы');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const renderGroup = (group: GroupWithRelations, level: number = 0) => {
    const hasSubgroups = group.subgroups && group.subgroups.length > 0;
    const isExpanded = expandedGroups.has(group.id);

    return (
      <div key={group.id} className="mb-2">
        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${
            level > 0 ? 'ml-8' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {hasSubgroups ? (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  )}
                </button>
              ) : (
                <div className="w-7" />
              )}

              {level === 0 ? (
                <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
              )}

              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">{group.name}</h3>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Контактов: {group.memberCount}
                  </span>
                  {group.senderEmail && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {group.senderEmail.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedParentId(group.id);
                  setShowAddModal(true);
                  setNewGroup((prev) => ({ ...prev, parent_group_id: group.id }));
                }}
                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Добавить подгруппу"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setGroupToEdit(group);
                  setEditForm({
                    name: group.name,
                    default_sender_email_id: group.default_sender_email_id || '',
                    default_subject: group.default_subject || '',
                    default_text_content: group.default_text_content || '',
                    default_html_content: group.default_html_content || '',
                  });
                  setShowEditModal(true);
                }}
                className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                title="Редактировать"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setGroupToDelete(group);
                  setShowDeleteModal(true);
                }}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Удалить"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {hasSubgroups && isExpanded && (
          <div className="mt-2">
            {group.subgroups!.map((subgroup) => renderGroup(subgroup, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Иерархические группы</h1>
          <p className="text-gray-600 dark:text-gray-400">Управление группами и подгруппами контактов</p>
        </div>
        <div className="flex gap-3">
          {duplicates.length > 0 && (
            <button
              onClick={() => setShowDuplicatesModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
            >
              <AlertTriangle className="w-5 h-5" />
              Дубли ({duplicates.length})
            </button>
          )}
          <button
            onClick={() => {
              setSelectedParentId(null);
              setNewGroup((prev) => ({ ...prev, parent_group_id: null }));
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Создать группу
          </button>
        </div>
      </div>

      {rootGroups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Нет созданных групп</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rootGroups.map((group) => renderGroup(group))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {selectedParentId ? 'Создать подгруппу' : 'Создать группу'}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Название группы"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта для отправки по умолчанию
                </label>
                <select
                  value={newGroup.default_sender_email_id}
                  onChange={(e) => setNewGroup({ ...newGroup, default_sender_email_id: e.target.value })}
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
                  value={newGroup.default_subject}
                  onChange={(e) => setNewGroup({ ...newGroup, default_subject: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Тема письма"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedParentId(null);
                    setNewGroup({
                      name: '',
                      parent_group_id: null,
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
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && groupToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
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
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта для отправки по умолчанию
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

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setGroupToEdit(null);
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

      {showDeleteModal && groupToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить группу?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Вы уверены, что хотите удалить группу <strong>{groupToDelete.name}</strong>?
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-6">
              Контакты, которые есть только в этой группе, будут удалены. Контакты из других групп останутся.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setGroupToDelete(null);
                }}
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

      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Обнаруженные дубли контактов</h2>

            {duplicates.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">Дублей не обнаружено</p>
            ) : (
              <div className="space-y-4">
                {duplicates.map((dup, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {dup.email}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Найден в следующих группах:
                    </p>
                    <ul className="space-y-1">
                      {dup.groups.map((group, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                          {group.groupPath}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowDuplicatesModal(false)}
              className="mt-6 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
