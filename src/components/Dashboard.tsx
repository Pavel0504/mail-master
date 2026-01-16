import { useEffect, useState } from 'react';
import { Mail, CheckCircle, XCircle, Users, TrendingUp } from 'lucide-react';
import { supabase, Email, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { WeeklyStatsChart } from './WeeklyStatsChart';

interface DashboardStats {
  totalSent: number;
  successSent: number;
  totalContacts: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalSent: 0,
    successSent: 0,
    totalContacts: 0,
  });
  const [emails, setEmails] = useState<Email[]>([]);
  const [changedContacts, setChangedContacts] = useState<Contact[]>([]);
  const [chartData, setChartData] = useState({ success: 0, failed: 0 });

  useEffect(() => {
    if (user) {
      loadDashboardData();
      const interval = setInterval(checkEmailStatus, 5 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    const [emailsRes, contactsRes, mailingsRes] = await Promise.all([
      supabase.from('emails').select('*').eq('user_id', user.id),
      user.role === 'admin'
        ? supabase.from('contacts').select('*')
        : supabase.from('contacts').select('*').eq('owner_id', user.id),
      supabase.from('mailing_recipients').select('status').eq('status', 'sent'),
    ]);

    if (emailsRes.data) {
      setEmails(emailsRes.data);
      const totalSent = emailsRes.data.reduce((acc, email) => acc + email.sent_count, 0);
      const successSent = emailsRes.data.reduce((acc, email) => acc + email.success_count, 0);
      setStats((prev) => ({ ...prev, totalSent, successSent }));
    }

    if (contactsRes.data) {
      setStats((prev) => ({ ...prev, totalContacts: contactsRes.data.length }));
      setChangedContacts(contactsRes.data.filter((c) => c.has_changes).slice(0, 5));
    }

    if (mailingsRes.data) {
      const totalRecipients = mailingsRes.data.length;
      const { data: failedData } = await Bolt Database
        .from('mailing_recipients')
        .select('status')
        .eq('status', 'failed');
      const failedCount = failedData?.length || 0;
      setChartData({ success: totalRecipients, failed: failedCount });
    }
  };

  const checkEmailStatus = async () => {
    if (!user) return;
    const { data } = await supabase.from('emails').select('*').eq('user_id', user.id);
    if (data) {
      for (const email of data) {
        await Bolt Database
          .from('emails')
          .update({ last_checked: new Date().toISOString() })
          .eq('id', email.id);
      }
      loadDashboardData();
    }
  };

  const viewContactChanges = async (contactId: string) => {
    await supabase.from('contacts').update({ has_changes: false }).eq('id', contactId);
    loadDashboardData();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Всего отправлено</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalSent}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Успешно отправлено</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.successSent}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Контактов</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalContacts}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Состояние почт для рассылки
          </h3>
          <div className="space-y-3">
            {emails.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">Нет добавленных почт</p>
            ) : (
              emails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{email.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Отправлено: {email.sent_count} | Успешно: {email.success_count}
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      email.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {email.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Статистика отправок
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Успешные</span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{chartData.success}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      chartData.success + chartData.failed > 0
                        ? (chartData.success / (chartData.success + chartData.failed)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Неудачные</span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">{chartData.failed}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-red-500 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      chartData.success + chartData.failed > 0
                        ? (chartData.failed / (chartData.success + chartData.failed)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <WeeklyStatsChart />

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Контакты с изменениями
        </h3>
        <div className="space-y-2">
          {changedContacts.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Нет новых изменений</p>
          ) : (
            changedContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => viewContactChanges(contact.id)}
                className="w-full flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{contact.name || 'Без имени'}</p>
                </div>
                <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">Новое</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
