// src/hooks/useContacts.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Contact } from "../types";

export function useContacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("owner_id", user.id)
          .order("email", { ascending: true });
        if (mounted) setContacts((data as Contact[]) || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  return { contacts, loading, setContacts };
}
export default useContacts;
