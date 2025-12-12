import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase, Email, Contact } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function EmailsPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [exclusionInput, setExclusionInput] = useState('');
  const [suggestions, setSuggestions] = useState<Contact[]>([]);

  const [newEmail, setNewEmail] = useState({
    email: '',
    password: '',
  });
  const [validatingEmail, setValidatingEmail] = useState(false);
  const [emailValidation, setEmailValidation] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      loadEmails();
    }
  }, [user]);

  useEffect(() => {
    if (selectedEmail) {
      loadExclusions();
    }
  }, [selectedEmail]);

  const loadEmails = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading emails:', error);
      return;
    }
    if (data) {
      setEmails(data);
    }
  };

  const loadExclusions = async () => {
    if (!selectedEmail) return;
    const { data } = await supabase
      .from('contact_exclusions')
      .select('contact_email')
      .eq('email_id', selectedEmail.id);

    if (data) {
      setExclusions(data.map(e => e.contact_email));
    }
  };

  const validateEmailAPI = async (email: string) => {
    setValidatingEmail(true);
    setEmailValidation(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/validate-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.status === 'VALID' && data.validations.mailbox_exists) {
        setEmailValidation({ valid: true, message: 'Почта валидна и существует' });
        return true;
      } else {
        let message = 'Почта не прошла валидацию';
        if (!data.validations.syntax) message = 'Неверный формат email';
        else if (!data.validations.domain_exists) message = 'Домен не существует';
        else if (!data.validations.mx_records) message = 'Отсутствуют MX записи';
        else if (!data.validations.mailbox_exists) message = 'Почтовый ящик не существует';
        else if (data.validations.is_disposable) message = 'Временная/одноразовая почта';

        setEmailValidation({ valid: false, message });
        return false;
      }
    } catch (err) {
      setEmailValidation({ valid: false, message: 'Ошибка проверки почты' });
      return false;
    } finally {
      setValidatingEmail(false);
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const isValid = await validateEmailAPI(newEmail.email);
      if (!isValid) {
        throw new Error('Почта не прошла валидацию. Проверьте правильность email адреса.');
      }

      const { error } = await supabase.from('emails').insert({
        user_id: user.id,
        email: newEmail.email,
        password: newEmail.password,
        status: 'active',
        sent_count: 0,
        success_count: 0,
        failed_count: 0,
      });

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'create',
        entity_type: 'email',
        entity_id: null,
        details: { email: newEmail.email },
      });

      setNewEmail({ email: '', password: '' });
      setEmailValidation(null);
      setShowAddModal(false);
      loadEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при добавлении почты');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmail = async () => {
    if (!emailToDelete) return;

    setLoading(true);
    try {
      await supabase.from('contact_exclusions').delete().eq('email_id', emailToDelete.id);

      const { error } = await supabase.from('emails').delete().eq('id', emailToDelete.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'delete',
        entity_type: 'email',
        entity_id: emailToDelete.id,
        details: { email: emailToDelete.email },
      });

      setShowDeleteModal(false);
      setEmailToDelete(null);
      if (selectedEmail?.id === emailToDelete.id) {
        setSelectedEmail(null);
      }
      loadEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении почты');
    } finally {
      setLoading(false);
    }
  };

  const searchContacts = async (query: string) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(10);

    if (data) {
      setSuggestions(data);
    }
  };

  const addExclusion = async (email: string) => {
    if (!selectedEmail || !email || exclusions.includes(email)) return;

    const { error } = await supabase.from('contact_exclusions').insert({
      email_id: selectedEmail.id,
      contact_email: email,
    });

    if (!error) {
      setExclusions([...exclusions, email]);
      setExclusionInput('');
      setSuggestions([]);

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'add_exclusion',
        entity_type: 'email',
        entity_id: selectedEmail.id,
        details: { excluded_email: email },
      });
    }
  };

  const removeExclusion = async (email: string) => {
    if (!selectedEmail) return;

    const { error } = await supabase
      .from('contact_exclusions')
      .delete()
      .eq('email_id', selectedEmail.id)
      .eq('contact_email', email);

    if (!error) {
      setExclusions(exclusions.filter(e => e !== email));

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'remove_exclusion',
        entity_type: 'email',
        entity_id: selectedEmail.id,
        details: { excluded_email: email },
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Управление почтами</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Добавить почту
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Список почт</h2>
          {emails.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Нет добавленных почт</p>
            </div>
          ) : (
            emails.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 transition-all cursor-pointer p-5 ${
                  selectedEmail?.id === email.id
                    ? 'border-blue-500 dark:border-blue-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">{email.email}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span>Успешно: {email.success_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>Неудачно: {email.failed_count}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          email.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}
                      >
                        {email.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmailToDelete(email);
                      setShowDeleteModal(true);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          {selectedEmail ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Детали почты</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                  <p className="text-gray-900 dark:text-white mt-1">{selectedEmail.email}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Статус</label>
                  <p className="text-gray-900 dark:text-white mt-1">{selectedEmail.status}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Всего отправлено</label>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{selectedEmail.sent_count}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Успешно</label>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{selectedEmail.success_count}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Исключения</h3>

                <div className="relative mb-3">
                  <input
                    type="email"
                    value={exclusionInput}
                    onChange={(e) => {
                      setExclusionInput(e.target.value);
                      searchContacts(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && exclusionInput) {
                        e.preventDefault();
                        addExclusion(exclusionInput);
                      }
                    }}
                    placeholder="Введите email для исключения"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {suggestions.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => addExclusion(contact.email)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.email}</p>
                          {contact.name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{contact.name}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {exclusions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Нет исключений</p>
                  ) : (
                    exclusions.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        {email}
                        <button
                          onClick={() => removeExclusion(email)}
                          className="ml-1 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Выберите почту для просмотра деталей</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Добавить почту</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail.email}
                  onChange={(e) => {
                    setNewEmail({ ...newEmail, email: e.target.value });
                    setEmailValidation(null);
                  }}
                  onBlur={() => {
                    if (newEmail.email && newEmail.email.includes('@')) {
                      validateEmailAPI(newEmail.email);
                    }
                  }}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="example@mail.com"
                  required
                />
                {validatingEmail && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Проверка почты...
                  </p>
                )}
                {emailValidation && (
                  <p className={`text-sm mt-1 ${emailValidation.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {emailValidation.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Пароль
                </label>
                <input
                  type="password"
                  value={newEmail.password}
                  onChange={(e) => setNewEmail({ ...newEmail, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  placeholder="Пароль почты"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewEmail({ email: '', password: '' });
                    setEmailValidation(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Отменить
                </button>
                <button
                  type="submit"
                  disabled={loading || validatingEmail || (emailValidation && !emailValidation.valid)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Добавление...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && emailToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить почту?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить почту <strong>{emailToDelete.email}</strong>? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setEmailToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteEmail}
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
