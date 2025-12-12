// src/components/DuplicatesModal.tsx
import React from "react";

export default function DuplicatesModal({
  duplicates,
  open,
  onClose,
  onExcludeAndContinue,
}: {
  duplicates: any[];
  open: boolean;
  onClose: () => void;
  onExcludeAndContinue: (excludedIds: string[]) => Promise<void>;
}) {
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-red-600">На эти контакты рассылка уже была</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>

        <div className="mb-6 space-y-2 max-h-96 overflow-y-auto">
          {duplicates.map(dup => {
            const isExcluded = excluded.has(dup.contact_id);
            return (
              <div key={dup.contact_id} className={`border rounded-lg p-3 ${isExcluded ? "bg-orange-50" : ""}`}>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={isExcluded} onChange={(e) => {
                    const s = new Set(excluded);
                    if (e.target.checked) s.add(dup.contact_id); else s.delete(dup.contact_id);
                    setExcluded(s);
                  }} />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{dup.contact_email}</div>
                    {dup.contact_name && <div className="text-xs text-gray-500">{dup.contact_name}</div>}
                    <div className="text-xs text-gray-600 mt-2">Рассылки: {dup.mailings.length}</div>
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={() => onClose()} className="flex-1 px-4 py-2 bg-gray-200 rounded-lg">Отменить</button>
          <button onClick={() => onExcludeAndContinue(Array.from(excluded))} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">Продолжить без выделенных</button>
        </div>
      </div>
    </div>
  );
}
