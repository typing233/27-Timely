"use client";

import { useEffect, useState } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Rule {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface Settings {
  minAdvanceHours: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [settings, setSettings] = useState<Settings>({ minAdvanceHours: 24, maxAdvanceDays: 60, bufferMinutes: 0 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch("/api/availability", { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.rules) setRules(data.rules);
        if (data.settings) setSettings(data.settings);
      });
  }, []);

  function updateRule(index: number, field: string, value: string | boolean) {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  }

  function addRule() {
    setRules([...rules, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true }]);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/availability", {
      method: "PUT",
      headers,
      body: JSON.stringify({ rules, settings }),
    });
    if (res.ok) {
      setMessage("Availability saved successfully");
      const data = await res.json();
      setRules(data.rules);
      setSettings(data.settings);
    }
    setSaving(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Availability Settings</h1>

      {message && (
        <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>
      )}

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Booking Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. Advance (hours)</label>
            <input
              type="number"
              value={settings.minAdvanceHours}
              onChange={(e) => setSettings({ ...settings, minAdvanceHours: Number(e.target.value) })}
              className="input-field"
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max. Advance (days)</label>
            <input
              type="number"
              value={settings.maxAdvanceDays}
              onChange={(e) => setSettings({ ...settings, maxAdvanceDays: Number(e.target.value) })}
              className="input-field"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buffer Between Bookings (min)</label>
            <input
              type="number"
              value={settings.bufferMinutes}
              onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })}
              className="input-field"
              min={0}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Weekly Schedule</h2>
          <button onClick={addRule} className="btn-secondary text-sm">Add Time Slot</button>
        </div>

        <div className="space-y-3">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <select
                value={rule.dayOfWeek}
                onChange={(e) => updateRule(i, "dayOfWeek", e.target.value)}
                className="input-field w-40"
              >
                {DAYS.map((day, idx) => (
                  <option key={idx} value={idx}>{day}</option>
                ))}
              </select>
              <input
                type="time"
                value={rule.startTime}
                onChange={(e) => updateRule(i, "startTime", e.target.value)}
                className="input-field w-32"
              />
              <span className="text-gray-500">to</span>
              <input
                type="time"
                value={rule.endTime}
                onChange={(e) => updateRule(i, "endTime", e.target.value)}
                className="input-field w-32"
              />
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={rule.isActive}
                  onChange={(e) => updateRule(i, "isActive", e.target.checked)}
                />
                <span className="text-sm">Active</span>
              </label>
              <button onClick={() => removeRule(i)} className="text-red-500 hover:text-red-700 text-sm">
                Remove
              </button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-gray-500 text-center py-4">No availability rules configured</p>
          )}
        </div>

        <div className="mt-4">
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save All Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
