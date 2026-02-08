// src/hooks/useMailingSender.ts
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

interface MailingSenderState {
  mailingId: string | null;
  isActive: boolean;
  currentRecipient: string | null;
  totalRecipients: number;
  sentCount: number;
  successCount: number;
  failedCount: number;
  error: string | null;
}

export function useMailingSender() {
  const [state, setState] = useState<MailingSenderState>({
    mailingId: null,
    isActive: false,
    currentRecipient: null,
    totalRecipients: 0,
    sentCount: 0,
    successCount: 0,
    failedCount: 0,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startMailing = async (mailingId: string) => {
    // Если уже идет отправка - останавливаем
    if (isActiveRef.current) {
      stopMailing();
    }

    // Создаем новый AbortController
    abortControllerRef.current = new AbortController();
    isActiveRef.current = true;

    setState({
      mailingId,
      isActive: true,
      currentRecipient: null,
      totalRecipients: 0,
      sentCount: 0,
      successCount: 0,
      failedCount: 0,
      error: null,
    });

    try {
      // Получаем общее количество получателей
      const { count } = await supabase
        .from("mailing_recipients")
        .select("*", { count: "exact", head: true })
        .eq("mailing_id", mailingId);

      const total = count || 0;

      setState(prev => ({ ...prev, totalRecipients: total }));

      // Обновляем статус рассылки на "sending"
      await supabase
        .from("mailings")
        .update({ status: "sending" })
        .eq("id", mailingId);

      // Запускаем процесс отправки
      await processMailing(mailingId, total);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Ошибка при запуске рассылки";
      setState(prev => ({
        ...prev,
        isActive: false,
        error: errorMsg,
      }));
      isActiveRef.current = false;
    }
  };

  const processMailing = async (mailingId: string, totalRecipients: number) => {
    const serverUrl = ''; // Empty string to use relative path

    let sentCount = 0;
    let successCount = 0;
    let failedCount = 0;

    while (isActiveRef.current) {
      try {
        // Проверяем, не отменена ли операция
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        // Получаем следующего pending получателя
        const { data: recipients } = await supabase
          .from("mailing_recipients")
          .select("id")
          .eq("mailing_id", mailingId)
          .eq("status", "pending")
          .limit(1);

        // Если больше нет pending получателей - завершаем
        if (!recipients || recipients.length === 0) {
          console.log("Все получатели обработаны");
          break;
        }

        const recipientId = recipients[0].id;

        setState(prev => ({
          ...prev,
          currentRecipient: recipientId,
        }));

        // Вызываем send-email для этого получателя
        const sendResponse = await fetch(`/api/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_id: recipientId }),
          signal: abortControllerRef.current?.signal,
        });

        const sendResult = await sendResponse.json();

        sentCount++;

        if (sendResult.success) {
          successCount++;
        } else {
          failedCount++;
        }

        setState(prev => ({
          ...prev,
          sentCount,
          successCount,
          failedCount,
        }));

        // Проверяем, есть ли еще pending получатели
        const { count: remainingCount } = await supabase
          .from("mailing_recipients")
          .select("*", { count: "exact", head: true })
          .eq("mailing_id", mailingId)
          .eq("status", "pending");

        // Если это был последний получатель - завершаем без задержки
        if (!remainingCount || remainingCount === 0) {
          console.log("Последний получатель отправлен");
          break;
        }

        // Случайная задержка между отправками (8-25 секунд)
        const minDelay = 8000;
        const maxDelay = 25000;
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

        console.log(`Ожидание ${randomDelay}ms перед следующей отправкой...`);

        // Ждем с возможностью отмены
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, randomDelay);

          if (abortControllerRef.current) {
            abortControllerRef.current.signal.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              reject(new Error("Отправка отменена"));
            });
          }
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.log("Отправка отменена пользователем");
          break;
        }

        console.error("Ошибка при отправке:", err);

        // Продолжаем со следующим получателем даже при ошибке
        sentCount++;
        failedCount++;

        setState(prev => ({
          ...prev,
          sentCount,
          failedCount,
        }));

        // Короткая задержка перед следующей попыткой
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Завершение отправки
    isActiveRef.current = false;

    setState(prev => ({
      ...prev,
      isActive: false,
      currentRecipient: null,
    }));

    console.log(`Отправка завершена: всего ${sentCount}, успешно ${successCount}, ошибок ${failedCount}`);
  };

  const stopMailing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isActiveRef.current = false;

    setState(prev => ({
      ...prev,
      isActive: false,
      currentRecipient: null,
    }));
  };

  return {
    state,
    startMailing,
    stopMailing,
  };
}

export default useMailingSender;
