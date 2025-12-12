import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Send } from 'lucide-react';
import { supabase, Contact, Email } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ContactHistory {
  id: string;
  contact_id: string;
  action_type: string;
  changed_fields: Record<string, unknown>;
  changed_by: string;
  created_at: string;
  user?: { login: string };
}

interface ContactVersion extends Contact {
  owner?: { login: string };
}

interface ContactShare {
  id: string;
  contact_id: string;
  requester_id: string;
  owner_id: string;
  status: string;
  created_at: string;
  requester?: { login: string };
}

export function ContactsPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contactHistory, setContactHistory] = useState<ContactHistory[]>([]);
  const [contactVersions, setContactVersions] = useState<ContactVersion[]>([]);
  const [pendingShares, setPendingShares] = useState<ContactShare[]>([]);

  const [newContacts, setNewContacts] = useState([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
  const [editForm, setEditForm] = useState({ email: '', name: '', link: '', default_sender_email_id: '' });

  useEffect(() => {
    if (user) {
      loadContacts();
      loadEmails();
      loadPendingShares();

      // Подписка на изменения контактов в реальном времени
      const contactsSubscription = supabase
        .channel('contacts_changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'contacts',
            filter: `owner_id=eq.${user.id}`,
          },
          () => {
            loadContacts();
          }
        )
        .subscribe();

      return () => {
        contactsSubscription.unsubscribe();
      };
    }
  }, [user]);

  const loadContacts = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading contacts:', error);
      return;
    }
    if (data) {
      setContacts(data);
    }
  };

  const loadEmails = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', user.id);

    if (data) {
      setEmails(data);
    }
  };

  const loadPendingShares = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('contact_shares')
      .select('*, requester:users!contact_shares_requester_id_fkey(login)')
      .eq('owner_id', user.id)
      .eq('status', 'pending');

    if (data) {
      setPendingShares(data);
    }
  };

  const loadContactHistory = async (contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    const { data: allContactsWithEmail } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', contact.email);

    if (!allContactsWithEmail) return;

    const contactIds = allContactsWithEmail.map(c => c.id);

    const { data: versionsData } = await supabase
      .from('contacts')
      .select('*, owner:users!contacts_owner_id_fkey(login)')
      .eq('email', contact.email)
      .order('created_at', { ascending: false });

    if (versionsData) {
      setContactVersions(versionsData);
    }

    const { data } = await supabase
      .from('contact_history')
      .select('*, user:users!contact_history_changed_by_fkey(login)')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });

    if (data) {
      setContactHistory(data);
    }
  };

  const handleAddContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      for (const contact of newContacts) {
        if (!contact.email) continue;

        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('*, owner:users!contacts_owner_id_fkey(login)')
          .eq('email', contact.email);

        const myContact = existingContacts?.find(c => c.owner_id === user.id);
        const otherContact = existingContacts?.find(c => c.owner_id !== user.id);

        if (myContact) {
          continue;
        }

        if (otherContact) {
          const { error: shareError } = await supabase.from('contact_shares').insert({
            contact_id: otherContact.id,
            requester_id: user.id,
            owner_id: otherContact.owner_id,
            status: 'pending',
          });

          if (!shareError) {
            await supabase.from('notifications').insert({
              user_id: otherContact.owner_id,
              type: 'contact_share_request',
              message: `Пользователь ${user.login} запросил доступ к контакту ${contact.email}`,
              data: { contact_id: otherContact.id, requester_id: user.id },
              read: false,
            });
          }
        } else {
          const { data: newContact, error: insertError } = await supabase.from('contacts').insert({
            email: contact.email,
            name: contact.name,
            link: contact.link,
            owner_id: user.id,
            default_sender_email_id: contact.default_sender_email_id || null,
            has_changes: false,
          }).select().single();

          if (!insertError && newContact) {
            await supabase.from('contact_history').insert({
              contact_id: newContact.id,
              action_type: 'create',
              changed_fields: {
                email: contact.email,
                name: contact.name,
                link: contact.link,
              },
              changed_by: user.id,
            });

            await supabase.from('activity_logs').insert({
              user_id: user.id,
              action_type: 'create',
              entity_type: 'contact',
              entity_id: newContact.id,
              details: { email: contact.email },
            });
          }
        }
      }

      setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
      setShowAddModal(false);
      loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при добавлении контактов');
    } finally {
      setLoading(false);
    }
  };

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactToEdit) return;

    setLoading(true);
    try {
      const changedFields: Record<string, unknown> = {};
      if (editForm.email !== contactToEdit.email) changedFields.email = editForm.email;
      if (editForm.name !== contactToEdit.name) changedFields.name = editForm.name;
      if (editForm.link !== contactToEdit.link) changedFields.link = editForm.link;
      if (editForm.default_sender_email_id !== (contactToEdit.default_sender_email_id || '')) {
        changedFields.default_sender_email_id = editForm.default_sender_email_id || null;
      }

      await supabase
        .from('contacts')
        .update({
          email: editForm.email,
          name: editForm.name,
          link: editForm.link,
          default_sender_email_id: editForm.default_sender_email_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactToEdit.id);

      if (Object.keys(changedFields).length > 0) {
        await supabase.from('contact_history').insert({
          contact_id: contactToEdit.id,
          action_type: 'update',
          changed_fields: changedFields,
          changed_by: user!.id,
        });
      }

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'update',
        entity_type: 'contact',
        entity_id: contactToEdit.id,
        details: { changes: changedFields },
      });

      setShowEditModal(false);
      setContactToEdit(null);
      loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при редактировании контакта');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!contactToDelete) return;

    setLoading(true);
    try {
      await supabase.from('contact_history').delete().eq('contact_id', contactToDelete.id);
      await supabase.from('contact_shares').delete().eq('contact_id', contactToDelete.id);
      await supabase.from('contacts').delete().eq('id', contactToDelete.id);

      await supabase.from('activity_logs').insert({
        user_id: user!.id,
        action_type: 'delete',
        entity_type: 'contact',
        entity_id: contactToDelete.id,
        details: { email: contactToDelete.email },
      });

      setShowDeleteModal(false);
      setContactToDelete(null);
      loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при удалении контакта');
    } finally {
      setLoading(false);
    }
  };

  const handleShareResponse = async (shareId: string, contactId: string, approve: boolean) => {
    if (!user) return;

    setLoading(true);
    try {
      if (approve) {
        const { data: originalContact } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', contactId)
          .single();

        if (originalContact) {
          const { data: share } = await supabase
            .from('contact_shares')
            .select('requester_id')
            .eq('id', shareId)
            .single();

          if (share) {
            const { data: newContact, error: insertError } = await supabase.from('contacts').insert({
              email: originalContact.email,
              name: originalContact.name,
              link: originalContact.link,
              owner_id: share.requester_id,
              has_changes: false,
            }).select().single();

            if (!insertError && newContact) {
              await supabase.from('contact_history').insert({
                contact_id: newContact.id,
                action_type: 'create',
                changed_fields: {
                  email: originalContact.email,
                  name: originalContact.name,
                  link: originalContact.link,
                  shared_from: user.id,
                },
                changed_by: share.requester_id,
              });
            }

            await supabase.from('notifications').insert({
              user_id: share.requester_id,
              type: 'contact_share_approved',
              message: `Ваш запрос на доступ к контакту ${originalContact.email} одобрен`,
              data: { contact_id: contactId },
              read: false,
            });
          }
        }

        await supabase.from('contact_shares').update({ status: 'approved' }).eq('id', shareId);
      } else {
        const { data: share } = await supabase
          .from('contact_shares')
          .select('requester_id, contact_id')
          .eq('id', shareId)
          .single();

        if (share) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('email')
            .eq('id', share.contact_id)
            .single();

          if (contact) {
            await supabase.from('notifications').insert({
              user_id: share.requester_id,
              type: 'contact_share_rejected',
              message: `Ваш запрос на доступ к контакту ${contact.email} отклонен`,
              data: { contact_id: share.contact_id },
              read: false,
            });
          }
        }

        await supabase.from('contact_shares').delete().eq('id', shareId);
      }

      loadPendingShares();
    } catch (err) {
      console.error('Error handling share response:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (contactId: string) => {
    if (expandedContact === contactId) {
      setExpandedContact(null);
      setContactHistory([]);
      setContactVersions([]);
    } else {
      setExpandedContact(contactId);
      loadContactHistory(contactId);
    }
  };

  const openEditModal = (contact: Contact) => {
    setContactToEdit(contact);
    setEditForm({
      email: contact.email,
      name: contact.name,
      link: contact.link,
      default_sender_email_id: contact.default_sender_email_id || '',
    });
    setShowEditModal(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Управление контактами</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Добавить контакты
        </button>
      </div>

      {pendingShares.length > 0 && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            Запросы на доступ к вашим контактам
          </h3>
          <div className="space-y-2">
            {pendingShares.map((share) => {
              const contact = contacts.find((c) => c.id === share.contact_id);
              return (
                <div key={share.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {share.requester?.login || 'Неизвестный пользователь'} запросил доступ к {contact?.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(share.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleShareResponse(share.id, share.contact_id, true)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm flex items-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Подтвердить
                    </button>
                    <button
                      onClick={() => handleShareResponse(share.id, share.contact_id, false)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Отклонить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {contacts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Нет добавленных контактов</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">{contact.email}</h3>
                    </div>
                    {contact.name && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Имя: {contact.name}</p>
                    )}
                    {contact.link && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">Ссылка: {contact.link}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(contact)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Редактировать"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setContactToDelete(contact);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => toggleExpand(contact.id)}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={expandedContact === contact.id ? 'Свернуть' : 'Раскрыть'}
                    >
                      {expandedContact === contact.id ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {expandedContact === contact.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/50">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Все версии контакта ({contactVersions.length})</h4>
                      {contactVersions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Загрузка...</p>
                      ) : (
                        <div className="space-y-2">
                          {contactVersions.map((version, index) => (
                            <div
                              key={version.id}
                              className="text-sm bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-600"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-gray-900 dark:text-white font-medium">
                                    Владелец: {version.owner?.login || 'Неизвестно'}
                                  </p>
                                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                                    Имя: {version.name || 'Не указано'}
                                  </p>
                                  <p className="text-gray-600 dark:text-gray-400 text-xs">
                                    Ссылка: {version.link || 'Не указана'}
                                  </p>
                                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                                    Создан: {new Date(version.created_at).toLocaleString('ru-RU')}
                                  </p>
                                  {version.updated_at && version.updated_at !== version.created_at && (
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                                      Обновлен: {new Date(version.updated_at).toLocaleString('ru-RU')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">История изменений ({contactHistory.filter((h) => h.action_type === 'update').length})</h4>
                        {contactHistory.filter((h) => h.action_type === 'update').length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Нет истории изменений</p>
                        ) : (
                          <div className="space-y-2">
                            {contactHistory
                              .filter((h) => h.action_type === 'update')
                              .map((history) => (
                                <div
                                  key={history.id}
                                  className="text-sm bg-white dark:bg-gray-800 p-3 rounded-lg"
                                >
                                  <p className="text-gray-900 dark:text-white font-medium mb-1">
                                    Изменения: {Object.keys(history.changed_fields).join(', ')}
                                  </p>
                                  <p className="text-gray-600 dark:text-gray-400 text-xs">
                                    Пользователь: {history.user?.login || 'Неизвестно'}
                                  </p>
                                  <p className="text-gray-500 dark:text-gray-400 text-xs">
                                    {new Date(history.created_at).toLocaleString('ru-RU')}
                                  </p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Почта по умолчанию</h4>
                        <select
                          value={contact.default_sender_email_id || ''}
                          onChange={async (e) => {
                            const emailId = e.target.value || null;
                            await supabase
                              .from('contacts')
                              .update({ default_sender_email_id: emailId })
                              .eq('id', contact.id);
                            loadContacts();
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                        >
                          <option value="">Не выбрано</option>
                          {emails.map((email) => (
                            <option key={email.id} value={email.id}>
                              {email.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Добавить контакты</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleAddContacts} className="space-y-4">
              {newContacts.map((contact, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Контакт {index + 1}</h3>
                    {newContacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewContacts(newContacts.filter((_, i) => i !== index))}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].email = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="example@mail.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Имя <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].name = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="Имя контакта"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ссылка <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="url"
                      value={contact.link}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].link = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Почта по умолчанию
                    </label>
                    <select
                      value={contact.default_sender_email_id}
                      onChange={(e) => {
                        const updated = [...newContacts];
                        updated[index].default_sender_email_id = e.target.value;
                        setNewContacts(updated);
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                    >
                      <option value="">Не выбрано</option>
                      {emails.map((email) => (
                        <option key={email.id} value={email.id}>
                          {email.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setNewContacts([...newContacts, { email: '', name: '', link: '', default_sender_email_id: '' }])}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                + Добавить еще контакт
              </button>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewContacts([{ email: '', name: '', link: '', default_sender_email_id: '' }]);
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
                  {loading ? 'Добавление...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && contactToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Редактировать контакт</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleEditContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Имя
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ссылка
                </label>
                <input
                  type="url"
                  value={editForm.link}
                  onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Почта по умолчанию
                </label>
                <select
                  value={editForm.default_sender_email_id}
                  onChange={(e) => setEditForm({ ...editForm, default_sender_email_id: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
                >
                  <option value="">Не выбрано</option>
                  {emails.map((email) => (
                    <option key={email.id} value={email.id}>
                      {email.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setContactToEdit(null);
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

      {showDeleteModal && contactToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Удалить контакт?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить контакт <strong>{contactToDelete.email}</strong>? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setContactToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Отменить
              </button>
              <button
                onClick={handleDeleteContact}
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
