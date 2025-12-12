// src/hooks/useMailings.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Mailing, Email, Contact } from "../types";

export interface MailingRecipient {
  id: string;
  mailing_id: string;
  contact_id: string;
  sender_email_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  contact?: Contact;
  sender_email?: Email;
}
export interface MailingWithRecipients extends Mailing {
  recipients?: MailingRecipient[];
}

export function useMailings() {
  const { user } = useAuth();
  const [mailings, setMailings] = useState<MailingWithRecipients[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase
        .from("mailings")
        .select(`
          *,
          mailing_recipients (
            id, mailing_id, contact_id, sender_email_id, status, sent_at, error_message,
            contact:contacts(*), sender_email:emails(*)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        const normalized = (data as any).map((m: any) => ({
          ...m,
          recipients: m.mailing_recipients ?? [],
        }));
        setMailings(normalized);
      } else {
        setMailings([]);
      }
    } catch (err: any) {
      setError(err?.message || "Ошибка загрузки рассылок");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();

    const ch = supabase
      .channel(`mailings-ch-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mailings", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    const interval = setInterval(load, 2000);
    return () => {
      ch.unsubscribe();
      clearInterval(interval);
    };
  }, [user, load]);

  return { mailings, loading, error, reload: load, setMailings };
}
export default useMailings;
