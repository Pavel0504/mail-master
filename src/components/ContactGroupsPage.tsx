import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, FolderOpen } from 'lucide-react';
import { supabase, ContactGroup, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ContactGroupWithCount extends ContactGroup {
  memberCount: number;
}

interface ContactGroupsPageProps {
  onOpenGroup: (groupId: string) => void;
}

export function ContactGroupsPage({ onOpenGroup }: ContactGroupsPageProps) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ContactGroupWithCount[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<ContactGroup | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [newGroup, setNewGroup] = useState({
    name: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
  });

  useEffect(() => {
    if (user) {
      loadGroups();
    }
  }, [user]);

  const loadGroups = async () => {
    if (!user) return;

    const { data: groupsData } = await supabase
      .from('contact_groups')
      .select('*')
      .eq('user_id', user.id)
      .is('parent_group_id', null)
      .order('created_at', { ascending: false });

    if (groupsData) {
      const groupsWithCounts = await Promise.all(
        groupsData.map(async (group) => {
          const { count } = await supabase
            .from('contact_group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);

          return {
            ...group,
            memberCount: count || 0,
          };
        })
      );

      setGroups(groupsWithCounts);
    }
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
      });

      if (insertError) throw insertError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'create',
        entity_type: 'contact_group',
        entity_id: null,
        details: { name: newGroup.name },
      });

      setNewGroup({ name: '' });
      setShowAddModal(false);
      loadGroups();
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
    if (!groupToDelete || !user) return;

    setLoading(true);
    try {
      await deleteGroupRecursive(groupToDelete.id);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении группы');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (group: ContactGroup) => {
    setGroupToEdit(group);
    setEditForm({
      name: group.name,
    });
    setShowEditModal(true);
  };


  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Группы контактов</h1>
          <p className="text-gray-600 dark:text-gray-400">Создавайте группы для организации контактов</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Создать группу
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">Нет созданных групп</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer"
              onClick={() => onOpenGroup(group.id)}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{group.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Контактов: {group.memberCount}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(group);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Редактировать
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupToDelete(group);
                      setShowDeleteModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Создать группу</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название группы <span className="text-red-600">*</span>
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

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewGroup({ name: '' });
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
                  Название группы <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
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
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить группу <strong>{groupToDelete.name}</strong>? Это действие нельзя отменить.
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
    </div>
  );
}
