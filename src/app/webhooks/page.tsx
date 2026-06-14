"use client";

import { useEffect, useState } from "react";

const EVENTS = [
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
];

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ url: "", events: [] as string[], secret: "" });
  const [loading, setLoading] = useState(true);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  async function fetchWebhooks() {
    const res = await fetch("/api/webhooks", { headers });
    const data = await res.json();
    setWebhooks(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/webhooks", { method: "POST", headers, body: JSON.stringify(form) });
    setShowForm(false);
    setForm({ url: "", events: [], secret: "" });
    fetchWebhooks();
  }

  async function toggleActive(webhook: Webhook) {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ isActive: !webhook.isActive }),
    });
    fetchWebhooks();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`/api/webhooks/${id}`, { method: "DELETE", headers });
    fetchWebhooks();
  }

  function toggleEvent(event: string) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">Add Webhook</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">New Webhook</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="input-field"
                placeholder="https://your-server.com/webhook"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret (optional)</label>
              <input
                type="text"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                className="input-field"
                placeholder="Signing secret for verification"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trigger Events</label>
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((event) => (
                  <label key={event} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.events.includes(event)}
                      onChange={() => toggleEvent(event)}
                    />
                    <span className="text-sm">{event}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {webhooks.map((wh) => (
          <div key={wh.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 break-all">{wh.url}</p>
              <p className="text-sm text-gray-500 mt-1">Events: {wh.events.join(", ")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(wh)} className={`text-xs px-2 py-1 rounded-full ${wh.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {wh.isActive ? "Active" : "Inactive"}
              </button>
              <button onClick={() => handleDelete(wh.id)} className="btn-danger text-sm">Delete</button>
            </div>
          </div>
        ))}
        {webhooks.length === 0 && (
          <p className="text-gray-500 text-center py-8">No webhooks configured</p>
        )}
      </div>
    </div>
  );
}
