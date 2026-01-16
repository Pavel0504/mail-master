import { useState, useEffect } from 'react';
import { TrendingUp, Trophy, Users, Calendar, Clock } from 'lucide-react';
import { supabase, User } from '../lib/supabase';

interface UserStat {
  user_id: string;
  user_login: string;
  all_time_count: number;
  month_count: number;
  week_count: number;
  last_updated: string;
}

type Period = 'all_time' | 'month' | 'week';

export function StatsPage() {
  const [stats, setStats] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('all_time');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data: statsData } = await supabase
        .from('user_stats')
        .select('*')
        .order('all_time_count', { ascending: false });

      if (statsData && statsData.length > 0) {
        const lastUpdated = statsData[0]?.last_updated;
        const needsUpdate = !lastUpdated || 
          (new Date().getTime() - new Date(lastUpdated).getTime()) > 24 * 60 * 60 * 1000;

        if (needsUpdate) {
          await calculateStats();
        } else {
          await enrichStatsWithUsers(statsData);
        }
      } else {
        await calculateStats();
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const enrichStatsWithUsers = async (statsData: any[]) => {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, login');

    const enriched = statsData.map((stat) => {
      const user = usersData?.find((u) => u.id === stat.user_id);
      return {
        user_id: stat.user_id,
        user_login: user?.login || 'Неизвестно',
        all_time_count: stat.all_time_count,
        month_count: stat.month_count,
        week_count: stat.week_count,
        last_updated: stat.last_updated,
      };
    });

    setStats(enriched);
    if (enriched.length > 0) {
      setLastUpdate(enriched[0].last_updated);
    }
  };

  const calculateStats = async () => {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, login');

    if (!usersData) return;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userStats: UserStat[] = [];

    for (const user of usersData) {
      const { data: allTimeRecipients } = await supabase
        .from('mailing_recipients')
        .select('mailing_id')
        .eq('status', 'sent')
        .in('mailing_id', 
          supabase
            .from('mailings')
            .select('id')
            .eq('user_id', user.id)
        );

      const { data: mailings } = await supabase
        .from('mailings')
        .select('id')
        .eq('user_id', user.id);

      const mailingIds = mailings?.map(m => m.id) || [];

      if (mailingIds.length === 0) {
        userStats.push({
          user_id: user.id,
          user_login: user.login,
          all_time_count: 0,
          month_count: 0,
          week_count: 0,
          last_updated: now.toISOString(),
        });
        continue;
      }

      const { count: allTimeCount } = await supabase
        .from('mailing_recipients')
        .select('*', { count: 'exact', head: true })
        .in('mailing_id', mailingIds)
        .eq('status', 'sent');

      const { count: monthCount } = await supabase
        .from('mailing_recipients')
        .select('*', { count: 'exact', head: true })
        .in('mailing_id', mailingIds)
        .eq('status', 'sent')
        .gte('sent_at', monthAgo.toISOString());

      const { count: weekCount } = await supabase
        .from('mailing_recipients')
        .select('*', { count: 'exact', head: true })
        .in('mailing_id', mailingIds)
        .eq('status', 'sent')
        .gte('sent_at', weekAgo.toISOString());

      userStats.push({
        user_id: user.id,
        user_login: user.login,
        all_time_count: allTimeCount || 0,
        month_count: monthCount || 0,
        week_count: weekCount || 0,
        last_updated: now.toISOString(),
      });

      await supabase
        .from('user_stats')
        .upsert({
          user_id: user.id,
          all_time_count: allTimeCount || 0,
          month_count: monthCount || 0,
          week_count: weekCount || 0,
          last_updated: now.toISOString(),
        }, { onConflict: 'user_id' });
    }

    setStats(userStats);
    setLastUpdate(now.toISOString());
  };

  const getSortedStats = () => {
    const sorted = [...stats];
    
    switch (selectedPeriod) {
      case 'month':
        sorted.sort((a, b) => b.month_count - a.month_count);
        break;
      case 'week':
        sorted.sort((a, b) => b.week_count - a.week_count);
        break;
      default:
        sorted.sort((a, b) => b.all_time_count - a.all_time_count);
    }

    return sorted;
  };

  const getCountForPeriod = (stat: UserStat) => {
    switch (selectedPeriod) {
      case 'month':
        return stat.month_count;
      case 'week':
        return stat.week_count;
      default:
        return stat.all_time_count;
    }
  };

  const getMedalColor = (position: number) => {
    switch (position) {
      case 0:
        return 'text-yellow-500 dark:text-yellow-400';
      case 1:
        return 'text-gray-400 dark:text-gray-300';
      case 2:
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-400 dark:text-gray-500';
    }
  };

  const sortedStats = getSortedStats();
  const maxCount = sortedStats.length > 0 ? getCountForPeriod(sortedStats[0]) : 1;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Статистика отправок</h1>
        <p className="text-gray-600 dark:text-gray-400">Рейтинг пользователей по количеству успешных отправок</p>
        {lastUpdate && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Последнее обновление: {new Date(lastUpdate).toLocaleString('ru-RU')}
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Выберите период</h2>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setSelectedPeriod('all_time')}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
                selectedPeriod === 'all_time'
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400'
                  : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">За все время</span>
            </button>
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
                selectedPeriod === 'month'
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400'
                  : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <Calendar className="w-6 h-6 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">За месяц</span>
            </button>
            <button
              onClick={() => setSelectedPeriod('week')}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-all ${
                selectedPeriod === 'week'
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400'
                  : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">За неделю</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Рейтинг пользователей
          </h2>
        </div>

        {sortedStats.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Нет данных для отображения</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedStats.map((stat, index) => {
              const count = getCountForPeriod(stat);
              const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

              return (
                <div
                  key={stat.user_id}
                  className={`p-6 transition-colors ${
                    index < 3 ? 'bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-700/30 dark:to-transparent' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 flex-shrink-0">
                      {index < 3 ? (
                        <Trophy className={`w-8 h-8 ${getMedalColor(index)}`} />
                      ) : (
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                            {index + 1}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                            {stat.user_login}
                          </h3>
                          {index === 0 && (
                            <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-medium rounded-full">
                              Лидер
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {count.toLocaleString('ru-RU')}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            отправок
                          </div>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${
                              index === 0
                                ? 'bg-gradient-to-r from-yellow-400 to-yellow-600'
                                : index === 1
                                ? 'bg-gradient-to-r from-gray-300 to-gray-400'
                                : index === 2
                                ? 'bg-gradient-to-r from-orange-400 to-orange-600'
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Всего</div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {stat.all_time_count.toLocaleString('ru-RU')}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Месяц</div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {stat.month_count.toLocaleString('ru-RU')}
                          </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 dark:text-gray-400 mb-1">Неделя</div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {stat.week_count.toLocaleString('ru-RU')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Автоматическое обновление
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Статистика автоматически пересчитывается раз в сутки при открытии страницы.
              Данные берутся из успешно отправленных писем (статус "sent").
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
