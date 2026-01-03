import { useState, useEffect } from 'react';
import { Activity, Filter, Package } from 'lucide-react';
import { supabase, ActivityLog, User } from '../lib/supabase';

export function AdminDashboard() {
  const [logs, setLogs] = useState<(ActivityLog & { user?: User })[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [shipmentStats, setShipmentStats] = useState({ successful: 0, failed: 0 });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [filterUser, filterAction]);

  const loadData = async () => {
    setLoading(true);

    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .order('login', { ascending: true });

    if (usersData) {
      setUsers(usersData);
    }

    const { data: mailingsData } = await supabase
      .from('mailings')
      .select('success_count, failed_count');

    if (mailingsData) {
      const totalSuccessful = mailingsData.reduce((sum, m) => sum + (m.success_count || 0), 0);
      const totalFailed = mailingsData.reduce((sum, m) => sum + (m.failed_count || 0), 0);
      setShipmentStats({ successful: totalSuccessful, failed: totalFailed });
    }

    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterUser !== 'all') {
      query = query.eq('user_id', filterUser);
    }

    if (filterAction !== 'all') {
      query = query.eq('action_type', filterAction);
    }

    const { data: logsData } = await query;

    if (logsData && usersData) {
      const logsWithUsers = logsData.map((log) => ({
        ...log,
        user: usersData.find((u) => u.id === log.user_id),
      }));
      setLogs(logsWithUsers);
    }

    setLoading(false);
  };

  const actionTypes = [
    { value: 'all', label: 'Все действия' },
    { value: 'login', label: 'Вход' },
    { value: 'logout', label: 'Выход' },
    { value: 'create', label: 'Создание' },
    { value: 'update', label: 'Обновление' },
    { value: 'delete', label: 'Удаление' },
    { value: 'add_exclusion', label: 'Добавление исключения' },
    { value: 'remove_exclusion', label: 'Удаление исключения' },
  ];

  const getActionBadge = (actionType: string) => {
    const colors: Record<string, string> = {
      login: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      logout: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
      create: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      update: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      add_exclusion: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      remove_exclusion: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[actionType] || colors.logout}`}>
        {actionType}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Логи действий пользователей</h1>
        <p className="text-gray-600 dark:text-gray-400">Мониторинг активности в системе (обновляется каждые 5 секунд)</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Фильтры</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Пользователь
            </label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
            >
              <option value="all">Все пользователи</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.login} ({user.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Тип действия
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
            >
              {actionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Статистика отправлений</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 mb-1">Успешные</div>
            <div className="text-3xl font-bold text-green-700 dark:text-green-300">{shipmentStats.successful}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <div className="text-sm text-red-600 dark:text-red-400 mb-1">Неуспешные</div>
            <div className="text-3xl font-bold text-red-700 dark:text-red-300">{shipmentStats.failed}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            История действий ({logs.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          {loading && logs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Нет логов для отображения</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {log.user?.login || 'Неизвестный пользователь'}
                        </span>
                        {getActionBadge(log.action_type)}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {log.entity_type}
                        </span>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded p-2 font-mono">
                          {JSON.stringify(log.details, null, 2)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 ml-4 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
