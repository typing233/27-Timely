"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

interface DashboardData {
  stats: {
    todayBookings: number;
    weekBookings: number;
    monthBookings: number;
    totalEventTypes: number;
  };
  upcomingBookings: Array<{
    id: string;
    guestName: string;
    guestEmail: string;
    startTime: string;
    endTime: string;
    eventType: { name: string };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="animate-pulse">Loading dashboard...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Today" value={data.stats.todayBookings} subtitle="bookings" />
        <StatCard title="This Week" value={data.stats.weekBookings} subtitle="bookings" />
        <StatCard title="This Month" value={data.stats.monthBookings} subtitle="bookings" />
        <StatCard title="Event Types" value={data.stats.totalEventTypes} subtitle="active" />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Upcoming Bookings</h2>
        {data.upcomingBookings.length === 0 ? (
          <p className="text-gray-500">No upcoming bookings</p>
        ) : (
          <div className="space-y-3">
            {data.upcomingBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{booking.eventType.name}</p>
                  <p className="text-sm text-gray-600">
                    with {booking.guestName} ({booking.guestEmail})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {format(new Date(booking.startTime), "MMM d, yyyy")}
                  </p>
                  <p className="text-sm text-gray-600">
                    {format(new Date(booking.startTime), "HH:mm")} -{" "}
                    {format(new Date(booking.endTime), "HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
