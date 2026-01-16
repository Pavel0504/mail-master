import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DailyStats {
  date: string;
  users: {
    userId: string;
    userName: string;
    count: number;
  }[];
}

const USER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // orange
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange-alt
];

export function WeeklyStatsChart() {
  const [weeklyData, setWeeklyData] = useState<DailyStats[]>([]);
  const [userColorMap, setUserColorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeeklyStats();
    const interval = setInterval(loadWeeklyStats, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadWeeklyStats = async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const { data: recipients } = await supabase
        .from('mailing_recipients')
        .select(`
          sent_at,
          mailing:mailings!inner(user_id, user:users!inner(login))
        `)
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo.toISOString())
        .order('sent_at', { ascending: true });

      if (!recipients) {
        setLoading(false);
        return;
      }

      const days: DailyStats[] = [];
      const allUsers = new Set<string>();

      for (let i = 0; i < 7; i++) {
        const date = new Date(sevenDaysAgo);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        const dayRecipients = recipients.filter((r) => {
          const sentDate = new Date(r.sent_at);
          return sentDate.toISOString().split('T')[0] === dateStr;
        });

        const userStats: Record<string, { userId: string; userName: string; count: number }> = {};

        dayRecipients.forEach((r) => {
          const userId = r.mailing?.user_id;
          const userName = r.mailing?.user?.login || 'Unknown';
          if (userId) {
            allUsers.add(userId);
            if (!userStats[userId]) {
              userStats[userId] = { userId, userName, count: 0 };
            }
            userStats[userId].count++;
          }
        });

        days.push({
          date: dateStr,
          users: Object.values(userStats),
        });
      }

      const colorMap: Record<string, string> = {};
      Array.from(allUsers).forEach((userId, index) => {
        colorMap[userId] = USER_COLORS[index % USER_COLORS.length];
      });

      setUserColorMap(colorMap);
      setWeeklyData(days);
      setLoading(false);
    } catch (error) {
      console.error('Error loading weekly stats:', error);
      setLoading(false);
    }
  };

  const maxCount = Math.max(
    3000,
    ...weeklyData.flatMap((day) => day.users.map((u) => u.count))
  );

  const allUsersInData = Array.from(
    new Set(weeklyData.flatMap((day) => day.users.map((u) => u.userId)))
  );

  const getUsersForDay = (day: DailyStats) => {
    return allUsersInData.map((userId) => {
      const userStat = day.users.find((u) => u.userId === userId);
      return {
        userId,
        userName: userStat?.userName || weeklyData
          .flatMap(d => d.users)
          .find(u => u.userId === userId)?.userName || 'Unknown',
        count: userStat?.count || 0,
      };
    });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Статистика отправок за неделю
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {allUsersInData.map((userId) => {
            const userName = weeklyData
              .flatMap(d => d.users)
              .find(u => u.userId === userId)?.userName || 'Unknown';
            return (
              <div key={userId} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: userColorMap[userId] }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">{userName}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative" style={{ height: '320px' }}>
        <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400 w-12">
          <span>{maxCount}</span>
          <span>{Math.floor(maxCount * 0.75)}</span>
          <span>{Math.floor(maxCount * 0.5)}</span>
          <span>{Math.floor(maxCount * 0.25)}</span>
          <span>0</span>
        </div>

        <div className="absolute left-12 right-0 top-0 bottom-8 border-l border-b border-gray-300 dark:border-gray-600">
          <div className="absolute inset-0 flex justify-between items-end px-2 pb-1">
            {weeklyData.map((day, dayIndex) => {
              const dayUsers = getUsersForDay(day);
              const totalForDay = dayUsers.reduce((sum, u) => sum + u.count, 0);
              const barWidth = `${100 / weeklyData.length - 2}%`;

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end h-full"
                  style={{ width: barWidth }}
                >
                  <div className="flex-1 w-full relative flex items-end justify-center gap-0.5">
                    {dayUsers.map((userStat) => {
                      if (userStat.count === 0) return null;
                      const heightPercent = (userStat.count / maxCount) * 100;
                      return (
                        <div
                          key={userStat.userId}
                          className="relative group transition-all duration-300 hover:opacity-80"
                          style={{
                            width: `${90 / dayUsers.length}%`,
                            height: `${heightPercent}%`,
                            backgroundColor: userColorMap[userStat.userId],
                            minHeight: userStat.count > 0 ? '2px' : '0',
                          }}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            {userStat.userName}: {userStat.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute inset-0 flex justify-between items-end">
            {weeklyData.map((day, index) => {
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString('ru-RU', { weekday: 'short' });
              const dayNum = date.getDate();
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center"
                  style={{ width: `${100 / weeklyData.length}%` }}
                >
                  <div className="h-full" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute left-12 right-0 bottom-0 h-8 flex justify-between items-center px-2">
          {weeklyData.map((day) => {
            const date = new Date(day.date);
            const dayName = date.toLocaleDateString('ru-RU', { weekday: 'short' });
            const dayNum = date.getDate();
            const month = date.toLocaleDateString('ru-RU', { month: 'short' });
            return (
              <div
                key={day.date}
                className="text-xs text-gray-600 dark:text-gray-400 text-center"
                style={{ width: `${100 / weeklyData.length}%` }}
              >
                <div className="font-medium">{dayName}</div>
                <div className="text-gray-500 dark:text-gray-500 text-[10px]">
                  {dayNum} {month}
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute left-12 right-0 top-0 bottom-8 pointer-events-none">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <div
              key={ratio}
              className="absolute left-0 right-0 border-t border-dashed border-gray-200 dark:border-gray-700"
              style={{ bottom: `${ratio * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
