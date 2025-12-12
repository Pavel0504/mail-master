// src/components/DeleteModal.tsx
import React from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export default function DeleteModal({ mailing, onClose, onDeleted }: { mailing: any | null, onClose: () => void, onDeleted?: () => void }) {
  const { user } = useAuth();
  if (!mailing) return null;
  const handleDelete = async () => {
    await supabase.from("mailing_recipients").delete().eq("mailing_id", mailing.id);
    await supabase.from("mailings").delete().eq("id", mailing.id);
    if (user) {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action_type: "delete",
        entity_type: "mailing",
        entity_id: mailing.id,
        details: { subject: mailing.subject },
      });
    }
    onDeleted?.();
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Удалить рассылку?</h2>
        <p className="mb-6">Вы уверены, что хотите удалить рассылку от <strong>{new Date(mailing.created_at).toLocaleString()}</strong>?</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg">Отменить</button>
          <button onClick={handleDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Удалить</button>
        </div>
      </div>
    </div>
  );
}
