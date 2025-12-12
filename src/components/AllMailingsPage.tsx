import { useState, useEffect } from 'react';
import { Send, Trash2, Eye, Search, X } from 'lucide-react';
import { supabase, Mailing, User } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface MailingWithUser extends Mailing {
  user?: User;
}

export function AllMailingsPage() {
  const { user } = useAuth();
  const [mailings, setMailings] = useState<MailingWithUser[]>([]);
  const [filteredMailings, setFilteredMailings] = useState<MailingWithUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedMailing, setSelectedMailing] = useState<MailingWithUser | null>(null);
  const [mailingToDelete, setMailingToDelete] = useState<MailingWithUser | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMailings();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = mailings.filter(
        (m) =>
          m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.user?.login.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMailings(filtered);
    } else {
      setFilteredMailings(mailings);
    }
  }, [searchQuery, mailings]);

  const loadMailings = async () => {
    const { data: mailingsData } = await supabase
      .from('mailings')
      .select('*')
      .order('created_at', { ascending: false });

    if (mailingsData) {
      const { data: usersData } = await supabase.from('users').select('*');

      const mailingsWithUsers = mailingsData.map((mailing) => ({
        ...mailing,
        user: usersData?.find((u) => u.id === mailing.user_id),
      }));

      setMailings(mailingsWithUsers);
      setFilteredMailings(mailingsWithUsers);
    }
  };

  const handleDeleteMailing = async () => {
    if (!mailingToDelete || !user) return;

    setLoading(true);
    try {
      await supabase.from('mailing_recipients').delete().eq('mailing_id', mailingToDelete.id);
      await supabase.from('mailings').delete().eq('id', mailingToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'delete',
        entity_type: 'mailing',
        entity_id: mailingToDelete.id,
        details: { admin_delete: true, subject: mailingToDelete.subject },
      });

      setShowDeleteModal(false);
      setMailingToDelete(null);
      loadMailings();
    } catch (err) {
      console.error('Error deleting mailing:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      sending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Все рассылки</h1>
        <p className="text-gray-600 dark:text-gray-400">Просмотр и управление всеми рассылками в системе</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по теме или создателю..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Send className="w-5 h-5" />
            Рассылки ({filteredMailings.length})
          </h3>
        </div>
        {filteredMailings.length === 0 ? (
          <div className="p-12 text-center">
            <Send className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Рассылки не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Тема
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Создатель
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Отправлено
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Создана
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredMailings.map((mailing) => (
                  <tr key={mailing.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {mailing.subject || 'Без темы'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {mailing.user?.login || 'Неизвестно'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {getStatusBadge(mailing.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {mailing.success_count} / {mailing.sent_count}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(mailing.created_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedMailing(mailing);
                            setShowViewModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title="Просмотр"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(mailing.status === 'pending' || mailing.status === 'failed') && (
                          <button
                            onClick={() => {
                              setMailingToDelete(mailing);
                              setShowDeleteModal(true);
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showViewModal && selectedMailing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Детали рассылки</h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedMailing(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Тема</label>
                <p className="text-gray-900 dark:text-white mt-1">{selectedMailing.subject || 'Без темы'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Создатель</label>
                <p className="text-gray-900 dark:text-white mt-1">{selectedMailing.user?.login || 'Неизвестно'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Статус</label>
                <div className="mt-1">{getStatusBadge(selectedMailing.status)}</div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Всего</label>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedMailing.sent_count}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Успешно</label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{selectedMailing.success_count}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Неудачно</label>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{selectedMailing.failed_count}</p>
                </div>
              </div>

              {selectedMailing.text_content && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Текст письма
                  </label>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                      {selectedMailing.text_content}
                    </pre>
                  </div>
                </div>
              )}

              {selectedMailing.html_content && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    HTML письма
                  </label>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                      {selectedMailing.html_content}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && mailingToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить рассылку?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить рассылку <strong>{mailingToDelete.subject}</strong>? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setMailingToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteMailing}
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
