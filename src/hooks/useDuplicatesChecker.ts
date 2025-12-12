// src/hooks/useDuplicatesChecker.ts
import { supabase } from "../lib/supabase";

/**
 * checkDuplicateMailings: for a given list of contact emails returns duplicates info
 * This is a tiny helper extracted from the big MailingsPage logic.
 */
export async function checkDuplicateMailings(contactEmails: string[]) {
  if (!contactEmails || contactEmails.length === 0) return [];
  // Query mailing_recipients join mailings for these contact emails
  const { data } = await supabase.rpc("check_duplicate_mailings", { emails: contactEmails }); 
  // NOTE: If the DB doesn't have RPC, implement raw query via .from/upserts similar to original code.
  return data || [];
}
