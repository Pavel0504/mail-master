import { useState } from 'react';
import { User, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [loginForm, setLoginForm] = useState({
    currentLogin: user?.login || '',
    newLogin: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChangeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('login', loginForm.newLogin)
        .maybeSingle();

      if (existingUser && existingUser.id !== user.id) {
        throw new Error('Этот логин уже занят');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          login: loginForm.newLogin,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'user',
        entity_id: user.id,
        details: { changed: 'login', old_value: user.login, new_value: loginForm.newLogin },
      });

      setSuccess('Логин успешно изменен. Войдите снова с новым логином.');
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при изменении логина');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('Новый пароль и подтверждение не совпадают');
      }

      if (passwordForm.newPassword.length < 4) {
        throw new Error('Пароль должен содержать минимум 4 символа');
      }

      const { data: currentUser } = await supabase
        .from('users')
        .select('password')
        .eq('id', user.id)
        .single();

      if (!currentUser || currentUser.password !== passwordForm.currentPassword) {
        throw new Error('Неверный текущий пароль');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          password: passwordForm.newPassword,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'update',
        entity_type: 'user',
        entity_id: user.id,
        details: { changed: 'password' },
      });

      setSuccess('Пароль успешно изменен. Войдите снова с новым паролем.');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      setTimeout(() => {
        logout();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при изменении пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Настройки</h1>
        <p className="text-gray-600 dark:text-gray-400">Управление настройками вашего профиля</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Изменить логин</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Обновите свой логин для входа</p>
            </div>
          </div>

          <form onSubmit={handleChangeLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Текущий логин
              </label>
              <input
                type="text"
                value={loginForm.currentLogin}
                disabled
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Новый логин
              </label>
              <input
                type="text"
                value={loginForm.newLogin}
                onChange={(e) => setLoginForm({ ...loginForm, newLogin: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                placeholder="Введите новый логин"
                required
                minLength={3}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !loginForm.newLogin}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Сохранение...' : 'Изменить логин'}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Изменить пароль</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Обновите свой пароль для входа</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Текущий пароль
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                placeholder="Введите текущий пароль"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Новый пароль
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                placeholder="Введите новый пароль"
                required
                minLength={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Подтверждение пароля
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                placeholder="Повторите новый пароль"
                required
                minLength={4}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Сохранение...' : 'Изменить пароль'}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Важно:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>После изменения логина или пароля вы будете автоматически выведены из системы</li>
          <li>Войдите снова, используя новые учетные данные</li>
          <li>Убедитесь, что запомнили новый логин и пароль</li>
        </ul>
      </div>
    </div>
  );
}
