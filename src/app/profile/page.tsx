"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setTimezone(user.timezone);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, timezone }),
      });
      if (res.ok) {
        const data = await res.json();
        updateUser(data);
        setMessage("Profile updated successfully");
      }
    } catch {
      setMessage("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile Settings</h1>
      <div className="card max-w-lg">
        {message && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">{message}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={user?.email || ""} className="input-field bg-gray-50" disabled />
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input-field">
              {Intl.supportedValuesOf("timeZone").map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      <div className="card max-w-lg mt-6">
        <h2 className="text-lg font-semibold mb-4">Calendar Integrations</h2>
        <div className="space-y-3">
          <IntegrationCard provider="Google Calendar" />
          <IntegrationCard provider="Apple Calendar" />
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ provider }: { provider: string }) {
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    const token = localStorage.getItem("token");
    if (provider === "Google Calendar") {
      const res = await fetch("/api/integrations/google", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      window.location.href = data.url;
    }
    setConnecting(false);
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <span className="font-medium">{provider}</span>
      <button onClick={connect} className="btn-secondary text-sm" disabled={connecting}>
        {connecting ? "Connecting..." : "Connect"}
      </button>
    </div>
  );
}
