// src/components/CreateEditModal/FileLoaders.tsx
import React from "react";

export default function FileLoaders({ onLoadText, onLoadHtml }: { onLoadText: (t: string) => void, onLoadHtml: (h: string) => void }) {
  const onText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onLoadText(String(reader.result || ""));
    reader.readAsText(f);
  };
  const onHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onLoadHtml(String(reader.result || ""));
    reader.readAsText(f);
  };
  return (
    <div>
      <label className="block text-sm font-medium mb-2">Загрузить файлы</label>
      <div className="flex gap-2">
        <input type="file" accept=".txt,text/plain" onChange={onText} />
        <input type="file" accept=".html,text/html" onChange={onHtml} />
      </div>
    </div>
  );
}
