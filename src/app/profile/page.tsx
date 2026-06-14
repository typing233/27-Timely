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
          <GoogleIntegrationCard />
          <AppleIntegrationCard />
        </div>
      </div>
    </div>
  );
}

function GoogleIntegrationCard() {
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    const token = localStorage.getItem("token");
    const res = await fetch("/api/integrations/google", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    window.location.href = data.url;
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <span className="font-medium">Google Calendar</span>
      <button onClick={connect} className="btn-secondary text-sm" disabled={connecting}>
        {connecting ? "Connecting..." : "Connect"}
      </button>
    </div>
  );
}

function AppleIntegrationCard() {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/integrations/apple", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.connected) setConnected(true);
      });
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError("");
    const token = localStorage.getItem("token");
    const res = await fetch("/api/integrations/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        username,
        appSpecificPassword: password,
        calendarUrl: calendarUrl || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setConnected(true);
      setShowForm(false);
    } else {
      setError(data.error || "Connection failed");
    }
    setConnecting(false);
  }

  async function disconnect() {
    const token = localStorage.getItem("token");
    await fetch("/api/integrations/apple", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setConnected(false);
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
        <div>
          <span className="font-medium">Apple Calendar</span>
          <span className="ml-2 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
        </div>
        <button onClick={disconnect} className="btn-secondary text-sm">Disconnect</button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="font-medium">Apple Calendar</span>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-secondary text-sm">Connect</button>
        )}
      </div>
      {showForm && (
        <form onSubmit={handleConnect} className="mt-4 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Apple ID (email)</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="input-field text-sm" placeholder="user@icloud.com" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">App-Specific Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field text-sm" placeholder="xxxx-xxxx-xxxx-xxxx" required />
            <p className="text-xs text-gray-500 mt-1">Generate at appleid.apple.com &rarr; Sign-In &rarr; App-Specific Passwords</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">CalDAV URL (optional)</label>
            <input type="url" value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)}
              className="input-field text-sm" placeholder="https://caldav.icloud.com/..." />
            <p className="text-xs text-gray-500 mt-1">Leave empty to auto-discover. Provide if auto-discovery fails.</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={connecting}>
              {connecting ? "Testing..." : "Connect"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
