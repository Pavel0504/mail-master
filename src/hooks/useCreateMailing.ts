// src/hooks/useCreateMailing.ts
import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export interface MailingCreatePayload {
  subject: string;
  text_content?: string | null;
  html_content?: string | null;
  scheduled_at?: string;
  scheduled_time?: string;
  timezone?: string;
  selected_contacts: string[];    // прямые контакты выбранные в UI
  selected_groups: string[];      // выбранные группы (parent group ids)
  exclude_contacts: string[];     // контакт ids исключённые
  send_now: boolean;
  subgroup_email_overrides: Record<string, string>; // { subgroupId: emailId }
}

/**
 * Опции для createMailing: передаем дополнительные состояния/коллекции,
 * которые раньше были в компоненте (contacts, emails и выбранные подгруппы/контакты).
 */
export interface CreateMailingOptions {
  selectedSubgroups: string[];   // выбранные подгруппы (ids)
  selectedContactsFromUI: string[]; // selectedContacts (ids) отдельно, на случай если UI хранит отдельно
  contacts: Array<any>;          // все контакты (массив объектов contacts из БД)
  emails: Array<any>;            // доступные sender emails (массив объектов emails из БД)
  excludeContactsOverride?: string[]; // если нужно передать override списка исключений
  onProgress?: (current: number, total: number) => void; // progress callback
}

export function useCreateMailing() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const executingRef = useRef(false);

  /**
   * createMailing: переносит логику proceedWithMailingCreation из MailingsPage.tsx
   * (с обработкой групп -> подгрупп -> контактов, выбором контента, выбором sender_email,
   * созданием mailings + mailing_recipients, вызовом functions/v1/send-email при send_now
   * и логированием в activity_logs).
   *
   * См. исходник: MailingsPage.tsx (proceedWithMailingCreation). :contentReference[oaicite:1]{index=1}
   */
  const createMailing = async (
    newMailing: MailingCreatePayload,
    opts: CreateMailingOptions
  ) => {
    if (!user) throw new Error("Неавторизованный пользователь");

    // Защита от множественных одновременных вызовов
    if (executingRef.current) {
      console.warn("Создание рассылки уже выполняется, игнорируем повторный вызов");
      return;
    }

    executingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // --- 1. вычисляем scheduledAt как в оригинале ---
      let scheduledAt: string | null = null;
      if (!newMailing.send_now && newMailing.scheduled_at && newMailing.scheduled_time) {
        const dateTime = `${newMailing.scheduled_at}T${newMailing.scheduled_time}:00`;
        scheduledAt = new Date(dateTime).toISOString();
      }

      // --- 2. используем ТОЧНО тот список контактов, который выбран в UI ---
      // Берем контакты напрямую из UI, без повторного сбора из групп
      const allContactIds = opts.selectedContactsFromUI || [];

      // Используем переданный override списка исключений (если есть) иначе из newMailing
      const excludeList = opts.excludeContactsOverride ?? newMailing.exclude_contacts ?? [];

      // Убираем исключённые контакты
      const finalContacts = allContactIds.filter((id) => !excludeList.includes(id));

      if (finalContacts.length === 0) {
        throw new Error("Нет контактов для отправки. Проверьте выбранные группы и контакты.");
      }

      // --- 3. определяем подгруппы для каждого контакта и собираем набор всех используемых подгрупп ---
      const contactSubgroupMap: Record<string, string[]> = {};
      const allSubgroupsUsed = new Set<string>();

      for (const contactId of finalContacts) {
        const { data: memberships } = await supabase
          .from("contact_group_members")
          .select("group_id")
          .eq("contact_id", contactId);

        if (memberships && memberships.length > 0) {
          contactSubgroupMap[contactId] = memberships.map((m: any) => m.group_id);
          memberships.forEach((m: any) => allSubgroupsUsed.add(m.group_id));
        } else {
          contactSubgroupMap[contactId] = [];
        }
      }

      // --- 4. подгружаем данные по подгруппам (default content, default_sender_email_id) ---
      const subgroupsData: Record<string, any> = {};
      if (allSubgroupsUsed.size > 0) {
        const { data: subgroupsList } = await supabase
          .from("contact_groups")
          .select("id, default_subject, default_text_content, default_html_content, default_sender_email_id")
          .in("id", Array.from(allSubgroupsUsed));

        if (subgroupsList) {
          subgroupsList.forEach((sg: any) => {
            subgroupsData[sg.id] = sg;
          });
        }
      }

      // --- 5. Выбор контента для рассылки (приоритет как в исходнике) ---
      let mailingSubject = newMailing.subject || "";
      let mailingTextContent: string | null = newMailing.text_content ?? null;
      let mailingHtmlContent: string | null = newMailing.html_content ?? null;

      if (opts.selectedSubgroups.length > 0) {
        // берем контент из первой выбранной подгруппы (если есть)
        const first = subgroupsData[opts.selectedSubgroups[0]];
        if (first) {
          mailingSubject = first.default_subject || mailingSubject;
          mailingTextContent = first.default_text_content ?? mailingTextContent;
          mailingHtmlContent = first.default_html_content ?? mailingHtmlContent;
        }
      } else if (newMailing.selected_groups.length > 0) {
        // берем из первой подгруппы первой выбранной группы
        const { data: firstGroupSubgroups } = await supabase
          .from("contact_groups")
          .select("*")
          .eq("parent_group_id", newMailing.selected_groups[0])
          .limit(1);

        if (firstGroupSubgroups && firstGroupSubgroups.length > 0) {
          const subgroup = firstGroupSubgroups[0];
          mailingSubject = subgroup.default_subject || mailingSubject;
          mailingTextContent = subgroup.default_text_content ?? mailingTextContent;
          mailingHtmlContent = subgroup.default_html_content ?? mailingHtmlContent;
        }
      } else if (finalContacts.length > 0) {
        // если только контакты — берем из подгруппы первого контакта (если есть)
        const firstContactId = finalContacts[0];
        const subgroupIds = contactSubgroupMap[firstContactId] || [];
        if (subgroupIds.length > 0) {
          const firstSubgroupData = subgroupsData[subgroupIds[0]];
          if (firstSubgroupData) {
            mailingSubject = firstSubgroupData.default_subject || mailingSubject;
            mailingTextContent = firstSubgroupData.default_text_content ?? mailingTextContent;
            mailingHtmlContent = firstSubgroupData.default_html_content ?? mailingHtmlContent;
          }
        }
      }

      // --- 6. создаём главный объект mailing ---
      const { data: mainMailing } = await supabase
        .from("mailings")
        .insert({
          user_id: user.id,
          subject: mailingSubject,
          text_content: mailingTextContent,
          html_content: mailingHtmlContent,
          scheduled_at: scheduledAt,
          timezone: newMailing.timezone,
          // <<< Изменение: всегда устанавливаем стартовый статус 'pending'.
          // Если send_now === true — мы оставляем отправку на process-mailing, который атомарно выставит 'sending'.
          status: "pending",
          sent_count: 0,
          success_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (!mainMailing) {
        throw new Error("Не удалось создать рассылку");
      }

      // --- 7. Собираем email overrides (subgroup overrides + default_sender_email_id из подгрупп) ---
      const recipientsToCreate: any[] = [];
      const groupEmailMap: Record<string, string> = {};

      // overrides из newMailing.subgroup_email_overrides + выбранных подгрупп
      for (const groupId of newMailing.selected_groups) {
        const { data: subgroups } = await supabase
          .from("contact_groups")
          .select("id")
          .eq("parent_group_id", groupId);

        if (subgroups) {
          for (const subgroup of subgroups) {
            const emailOverride = newMailing.subgroup_email_overrides?.[subgroup.id];
            if (emailOverride) {
              groupEmailMap[subgroup.id] = emailOverride;
            }
          }
        }
      }

      for (const subgroupId of opts.selectedSubgroups) {
        const emailOverride = newMailing.subgroup_email_overrides?.[subgroupId];
        if (emailOverride) groupEmailMap[subgroupId] = emailOverride;
      }

      // подгружаем default_sender_email_id для всех использованных подгрупп (если ещё не в map)
      if (allSubgroupsUsed.size > 0) {
        const { data: subgroupsList } = await supabase
          .from("contact_groups")
          .select("id, default_sender_email_id")
          .in("id", Array.from(allSubgroupsUsed));

        if (subgroupsList) {
          subgroupsList.forEach((sg: any) => {
            if (sg.default_sender_email_id && !groupEmailMap[sg.id]) {
              groupEmailMap[sg.id] = sg.default_sender_email_id;
            }
          });
        }
      }

      // --- 8. Для каждого контакта выбираем sender_email_id по приоритетам и собираем recipientsToCreate ---
      for (let idx = 0; idx < finalContacts.length; idx++) {
        const contactId = finalContacts[idx];
        const contact = opts.contacts.find((c) => c.id === contactId);
        if (!contact) continue;

        opts.onProgress?.(idx + 1, finalContacts.length);

        let senderEmailId: string | null = null;

        // Приоритет 1: default_sender_email_id контакта
        if (contact.default_sender_email_id) {
          senderEmailId = contact.default_sender_email_id;
        } else {
          // Приоритет 2: email override подгруппы (учитывая contact_exclusions)
          const contactSubgroups = contactSubgroupMap[contactId] || [];

          for (const subgroupId of contactSubgroups) {
            const subgroupEmailId = groupEmailMap[subgroupId];
            if (subgroupEmailId) {
              // Проверяем, нет ли в contact_exclusions записи блокирующей конкретный email на этот contact.email
              const { data: exclusions } = await supabase
                .from("contact_exclusions")
                .select("id")
                .eq("email_id", subgroupEmailId)
                .eq("contact_email", contact.email)
                .limit(1);

              if (!exclusions || exclusions.length === 0) {
                senderEmailId = subgroupEmailId;
                break;
              }
            }
          }
        }

        // Приоритет 3: первая доступная почта пользователя (emails[0])
        if (!senderEmailId) {
          senderEmailId = opts.emails[0]?.id || null;
        }

        recipientsToCreate.push({
          mailing_id: mainMailing.id,
          contact_id: contactId,
          sender_email_id: senderEmailId,
          status: "pending",
          sent_at: null,
          error_message: null,
        });
      }

      // --- 9. Вставляем recipients в БД и (если send_now) — вызываем функцию обработки рассылки ---
      if (recipientsToCreate.length > 0) {
        const { data: insertedRecipients } = await supabase
          .from("mailing_recipients")
          .insert(recipientsToCreate)
          .select();

        if (newMailing.send_now && insertedRecipients && insertedRecipients.length > 0) {
          const serverUrl = import.meta.env.VITE_SERVER_URL;

          fetch(`${serverUrl}/api/process-mailing`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ mailing_id: mainMailing.id }),
          }).catch((err) => console.error("Failed to process mailing:", err));
        }
      }

      // --- 10. activity log (create) ---
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action_type: "create",
        entity_type: "mailing",
        entity_id: null,
        details: {
          subject: newMailing.subject,
          recipients_count: recipientsToCreate.length,
          send_now: newMailing.send_now,
        },
      });

      // Возвращаем созданный объект mailing для удобства
      return mainMailing;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Ошибка при создании рассылки";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
      executingRef.current = false;
    }
  };

  return { createMailing, loading, error };
}

export default useCreateMailing;
