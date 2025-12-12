import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase, Notification } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const TIMEZONES = [
  { label: 'ET', iana: 'America/New_York', name: 'Eastern Time' },
  { label: 'CT', iana: 'America/Chicago', name: 'Central Time' },
  { label: 'MT', iana: 'America/Denver', name: 'Mountain Time' },
  { label: 'PT', iana: 'America/Los_Angeles', name: 'Pacific Time' },
  { label: 'GMT', iana: 'Etc/GMT', name: 'Greenwich Mean Time' },
  { label: 'UTC', iana: 'Etc/UTC', name: 'Coordinated Universal Time' },
  { label: 'CET', iana: 'Europe/Berlin', name: 'Central European Time' },
  { label: 'EET', iana: 'Europe/Helsinki', name: 'Eastern European Time' },
  { label: 'MSK', iana: 'Europe/Moscow', name: 'Moscow Time' },
  { label: 'IST', iana: 'Asia/Kolkata', name: 'India Standard Time' },
  { label: 'CST', iana: 'Asia/Shanghai', name: 'China Standard Time' },
  { label: 'HKT', iana: 'Asia/Hong_Kong', name: 'Hong Kong Time' },
  { label: 'JST', iana: 'Asia/Tokyo', name: 'Japan Standard Time' },
  { label: 'KST', iana: 'Asia/Seoul', name: 'Korea Standard Time' },
];

export function Header() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedTimezone, setSelectedTimezone] = useState(TIMEZONES[5]);
  const [showTimezones, setShowTimezones] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const timezoneRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const subscription = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timezoneRef.current && !timezoneRef.current.contains(event.target as Node)) {
        setShowTimezones(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    loadNotifications();
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: selectedTimezone.iana,
    }).format(date);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: selectedTimezone.iana,
    }).format(date);
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MailServerCE</h1>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <span>{formatDate(currentTime)}</span>
          <span className="font-mono">{formatTime(currentTime)}</span>
          <div className="relative" ref={timezoneRef}>
            <button
              onClick={() => setShowTimezones(!showTimezones)}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              {selectedTimezone.label}
            </button>
            {showTimezones && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                {TIMEZONES.map((tz) => (
                  <button
                    key={tz.iana}
                    onClick={() => {
                      setSelectedTimezone(tz);
                      setShowTimezones(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      selectedTimezone.iana === tz.iana ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900 dark:text-white">{tz.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{tz.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Уведомления</h3>
              </div>
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">Нет уведомлений</div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                    className={`p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <p className="text-sm text-gray-900 dark:text-white">{notification.message}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(notification.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
