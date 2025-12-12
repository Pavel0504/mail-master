import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Eye } from 'lucide-react';
import { supabase, User, Contact, Email, Mailing } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface UserProfile {
  user: User;
  contactsCount: number;
  emailsCount: number;
  mailingsCount: number;
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [profileData, setProfileData] = useState<{
    contacts: Contact[];
    emails: Email[];
    mailings: Mailing[];
  }>({
    contacts: [],
    emails: [],
    mailings: [],
  });

  const [newUser, setNewUser] = useState({
    login: '',
    password: '',
    role: 'user' as 'user' | 'admin',
  });

  const [editForm, setEditForm] = useState({
    login: '',
    password: '',
    role: 'user' as 'user' | 'admin',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .order('login', { ascending: true });

    if (usersData) {
      const usersWithStats = await Promise.all(
        usersData.map(async (user) => {
          const [contactsRes, emailsRes, mailingsRes] = await Promise.all([
            supabase.from('contacts').select('id', { count: 'exact' }).eq('owner_id', user.id),
            supabase.from('emails').select('id', { count: 'exact' }).eq('user_id', user.id),
            supabase.from('mailings').select('id', { count: 'exact' }).eq('user_id', user.id),
          ]);

          return {
            user,
            contactsCount: contactsRes.count || 0,
            emailsCount: emailsRes.count || 0,
            mailingsCount: mailingsRes.count || 0,
          };
        })
      );

      setUsers(usersWithStats);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setLoading(true);
    setError('');

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('login', newUser.login)
        .maybeSingle();

      if (existingUser) {
        throw new Error('Пользователь с таким логином уже существует');
      }

      const { error: insertError } = await supabase.from('users').insert({
        login: newUser.login,
        password: newUser.password,
        role: newUser.role,
      });

      if (insertError) throw insertError;

      await supabase.from('activity_logs').insert({
        user_id: currentUser.id,
        action_type: 'create',
        entity_type: 'user',
        entity_id: null,
        details: { login: newUser.login, role: newUser.role },
      });

      setNewUser({ login: '', password: '', role: 'user' });
      setShowAddModal(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании пользователя');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit || !currentUser) return;

    setLoading(true);
    setError('');

    try {
      if (editForm.login !== userToEdit.login) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('login', editForm.login)
          .neq('id', userToEdit.id)
          .maybeSingle();

        if (existingUser) {
          throw new Error('Пользователь с таким логином уже существует');
        }
      }

      await supabase
        .from('users')
        .update({
          login: editForm.login,
          password: editForm.password,
          role: editForm.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userToEdit.id);

      await supabase.from('activity_logs').insert({
        user_id: currentUser.id,
        action_type: 'update',
        entity_type: 'user',
        entity_id: userToEdit.id,
        details: { login: editForm.login, role: editForm.role },
      });

      setShowEditModal(false);
      setUserToEdit(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании пользователя');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || !currentUser) return;

    setLoading(true);
    try {
      await supabase.from('activity_logs').delete().eq('user_id', userToDelete.id);
      await supabase.from('notifications').delete().eq('user_id', userToDelete.id);
      await supabase.from('contact_shares').delete().or(`requester_id.eq.${userToDelete.id},owner_id.eq.${userToDelete.id}`);

      const { data: mailings } = await supabase.from('mailings').select('id').eq('user_id', userToDelete.id);
      if (mailings) {
        for (const mailing of mailings) {
          await supabase.from('mailing_recipients').delete().eq('mailing_id', mailing.id);
        }
      }
      await supabase.from('mailings').delete().eq('user_id', userToDelete.id);

      const { data: contacts } = await supabase.from('contacts').select('id').eq('owner_id', userToDelete.id);
      if (contacts) {
        for (const contact of contacts) {
          await supabase.from('contact_history').delete().eq('contact_id', contact.id);
        }
      }
      await supabase.from('contacts').delete().eq('owner_id', userToDelete.id);

      const { data: emails } = await supabase.from('emails').select('id').eq('user_id', userToDelete.id);
      if (emails) {
        for (const email of emails) {
          await supabase.from('contact_exclusions').delete().eq('email_id', email.id);
        }
      }
      await supabase.from('emails').delete().eq('user_id', userToDelete.id);

      await supabase.from('users').delete().eq('id', userToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: currentUser.id,
        action_type: 'delete',
        entity_type: 'user',
        entity_id: userToDelete.id,
        details: { login: userToDelete.login },
      });

      setShowDeleteModal(false);
      setUserToDelete(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении пользователя');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setEditForm({
      login: user.login,
      password: user.password,
      role: user.role,
    });
    setShowEditModal(true);
  };

  const openProfileModal = async (user: User) => {
    setSelectedUserProfile(user);
    setShowProfileModal(true);

    const [contactsRes, emailsRes, mailingsRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('emails').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('mailings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    setProfileData({
      contacts: contactsRes.data || [],
      emails: emailsRes.data || [],
      mailings: mailingsRes.data || [],
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Управление пользователями</h1>
          <p className="text-gray-600 dark:text-gray-400">Создание, редактирование и удаление пользователей</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Добавить пользователя
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((userProfile) => (
          <div
            key={userProfile.user.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-all cursor-pointer"
            onClick={() => openProfileModal(userProfile.user)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">
                  {userProfile.user.login}
                </h3>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    userProfile.user.role === 'admin'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
                >
                  {userProfile.user.role}
                </span>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Контактов:</span>
                <span className="font-medium text-gray-900 dark:text-white">{userProfile.contactsCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Почт:</span>
                <span className="font-medium text-gray-900 dark:text-white">{userProfile.emailsCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Рассылок:</span>
                <span className="font-medium text-gray-900 dark:text-white">{userProfile.mailingsCount}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditModal(userProfile.user);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-sm"
              >
                <Edit2 className="w-4 h-4" />
                Редактировать
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setUserToDelete(userProfile.user);
                  setShowDeleteModal(true);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Добавить пользователя</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Логин
                </label>
                <input
                  type="text"
                  value={newUser.login}
                  onChange={(e) => setNewUser({ ...newUser, login: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Логин пользователя"
                  required
                  minLength={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Пароль
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Пароль пользователя"
                  required
                  minLength={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Роль
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'user' | 'admin' })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewUser({ login: '', password: '', role: 'user' });
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

      {showEditModal && userToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Редактировать пользователя</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Логин
                </label>
                <input
                  type="text"
                  value={editForm.login}
                  onChange={(e) => setEditForm({ ...editForm, login: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                  minLength={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Пароль
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                  minLength={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Роль
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as 'user' | 'admin' })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setUserToEdit(null);
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

      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить пользователя?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить пользователя <strong>{userToDelete.login}</strong>? Это действие удалит все данные пользователя и нельзя будет отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
              >
                {loading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && selectedUserProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Профиль пользователя: {selectedUserProfile.login}
              </h2>
              <button
                onClick={() => {
                  setShowProfileModal(false);
                  setSelectedUserProfile(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Eye className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Контакты ({profileData.contacts.length})</h3>
                {profileData.contacts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Нет контактов</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profileData.contacts.map((contact) => (
                      <div key={contact.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {contact.email} {contact.name && `(${contact.name})`}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Почты ({profileData.emails.length})</h3>
                {profileData.emails.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Нет почт</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profileData.emails.map((email) => (
                      <div key={email.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {email.email} - {email.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Рассылки ({profileData.mailings.length})</h3>
                {profileData.mailings.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Нет рассылок</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {profileData.mailings.map((mailing) => (
                      <div key={mailing.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {mailing.subject || 'Без темы'} - {mailing.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
