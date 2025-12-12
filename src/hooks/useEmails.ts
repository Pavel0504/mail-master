// src/hooks/useEmails.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { Email } from "../types";

export function useEmails() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("emails")
        .select("*")
        .eq("user_id", user.id)
        .order("email", { ascending: true });
      if (mounted) setEmails((data as Email[]) || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  return { emails, loading, setEmails };
}
export default useEmails;
