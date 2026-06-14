"use client";

import { useEffect, useState } from "react";

interface Template {
  type: string;
  subject: string;
  body: string;
  isActive: boolean;
  isCustom: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION_HOST: "Booking Confirmation (Host)",
  BOOKING_CONFIRMATION_GUEST: "Booking Confirmation (Guest)",
  BOOKING_CANCELLATION_HOST: "Cancellation Notice (Host)",
  BOOKING_CANCELLATION_GUEST: "Cancellation Notice (Guest)",
  BOOKING_REMINDER: "Booking Reminder",
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    const res = await fetch("/api/email-templates", { headers });
    const data = await res.json();
    setTemplates(data);
    setLoading(false);
  }

  async function handleSave() {
    if (!editing) return;
    await fetch("/api/email-templates", {
      method: "PUT",
      headers,
      body: JSON.stringify(editing),
    });
    setEditing(null);
    fetchTemplates();
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Email Templates</h1>
      <p className="text-gray-600 mb-4">
        Available variables: {"{{hostName}}, {{guestName}}, {{guestEmail}}, {{eventName}}, {{date}}, {{startTime}}, {{endTime}}, {{timezone}}, {{cancelUrl}}, {{notes}}"}
      </p>

      {editing && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Edit: {TYPE_LABELS[editing.type]}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                className="input-field font-mono text-sm"
                rows={10}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              <span className="text-sm">Active (use custom template)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn-primary">Save Template</button>
              <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.type} className="card flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">{TYPE_LABELS[t.type] || t.type}</h3>
              <p className="text-sm text-gray-500">{t.subject}</p>
              {t.isCustom && <span className="text-xs text-primary-600">Custom template</span>}
            </div>
            <button onClick={() => setEditing(t)} className="btn-secondary text-sm">Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}
