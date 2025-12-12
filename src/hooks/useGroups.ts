// src/hooks/useGroups.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import type { ContactGroup } from "../types";

export function useGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("contact_groups")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });
      if (mounted) setGroups((data as ContactGroup[]) || []);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  return { groups, loading, setGroups };
}
export default useGroups;
