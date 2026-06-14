"use client";

import { useEffect, useState } from "react";

interface EventType {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  slug: string;
  isActive: boolean;
}

export default function EventTypesPage() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [form, setForm] = useState({ name: "", description: "", duration: 30, slug: "" });
  const [loading, setLoading] = useState(true);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchEventTypes();
  }, []);

  async function fetchEventTypes() {
    const res = await fetch("/api/event-types", { headers });
    const data = await res.json();
    setEventTypes(data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await fetch(`/api/event-types/${editing.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/event-types", {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: "", description: "", duration: 30, slug: "" });
    fetchEventTypes();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event type?")) return;
    await fetch(`/api/event-types/${id}`, { method: "DELETE", headers });
    fetchEventTypes();
  }

  function startEdit(et: EventType) {
    setEditing(et);
    setForm({ name: et.name, description: et.description || "", duration: et.duration, slug: et.slug });
    setShowForm(true);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Event Types</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: "", description: "", duration: 30, slug: "" }); }} className="btn-primary">
          New Event Type
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit" : "Create"} Event Type</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  className="input-field"
                  placeholder="meeting-30min"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                className="input-field w-32"
                min={5}
                max={480}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">{editing ? "Update" : "Create"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {eventTypes.map((et) => (
          <div key={et.id} className="card flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">{et.name}</h3>
              <p className="text-sm text-gray-500">{et.duration} min | /{et.slug}</p>
              {et.description && <p className="text-sm text-gray-600 mt-1">{et.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${et.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {et.isActive ? "Active" : "Inactive"}
              </span>
              <button onClick={() => startEdit(et)} className="btn-secondary text-sm">Edit</button>
              <button onClick={() => handleDelete(et.id)} className="btn-danger text-sm">Delete</button>
            </div>
          </div>
        ))}
        {eventTypes.length === 0 && (
          <p className="text-gray-500 text-center py-8">No event types yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
