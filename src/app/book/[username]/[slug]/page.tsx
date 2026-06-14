"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns";

interface EventTypeInfo {
  id: string;
  name: string;
  description: string | null;
  duration: number;
}

interface TimeSlot {
  start: string;
  end: string;
}

export default function BookingPage() {
  const params = useParams();
  const username = params.username as string;
  const slug = params.slug as string;

  const [eventType, setEventType] = useState<EventTypeInfo | null>(null);
  const [hostName, setHostName] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [step, setStep] = useState<"calendar" | "form" | "success">("calendar");
  const [form, setForm] = useState({ name: "", email: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    fetch(`/api/book/${username}/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.eventType) {
          setEventType(data.eventType);
          setHostName(data.user?.name || username);
        }
      });
  }, [username, slug]);

  useEffect(() => {
    if (selectedDate) {
      setLoadingSlots(true);
      fetch(`/api/book/${username}/${slug}?date=${selectedDate}&timezone=${timezone}`)
        .then((res) => res.json())
        .then((data) => {
          setSlots(data.slots || []);
          setLoadingSlots(false);
        });
    }
  }, [selectedDate, timezone, username, slug]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !eventType) return;
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: eventType.id,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        guestName: form.name,
        guestEmail: form.email,
        guestNotes: form.notes || undefined,
        timezone,
      }),
    });

    if (res.ok) {
      const booking = await res.json();
      setBookingId(booking.id);
      setStep("success");
    } else {
      const data = await res.json();
      setError(data.error || "Booking failed");
    }
    setSubmitting(false);
  }

  if (!eventType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600 mb-4">
            Your {eventType.name} with {hostName} has been scheduled.
          </p>
          <p className="text-sm text-gray-500 mb-4">A confirmation email has been sent to {form.email}</p>
          {bookingId && (
            <a
              href={`/api/ics/${bookingId}`}
              className="btn-secondary inline-block"
            >
              Download .ics file
            </a>
          )}
        </div>
      </div>
    );
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = monthStart.getDay();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="card">
          <div className="border-b border-gray-200 pb-4 mb-6">
            <p className="text-sm text-gray-500">{hostName}</p>
            <h1 className="text-2xl font-bold text-gray-900">{eventType.name}</h1>
            {eventType.description && <p className="text-gray-600 mt-1">{eventType.description}</p>}
            <p className="text-sm text-gray-500 mt-2">{eventType.duration} minutes</p>
          </div>

          {step === "calendar" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentMonth(addDays(monthStart, -1))}
                      className="btn-secondary text-sm px-2 py-1"
                    >
                      &lt;
                    </button>
                    <button
                      onClick={() => setCurrentMonth(addDays(monthEnd, 1))}
                      className="btn-secondary text-sm px-2 py-1"
                    >
                      &gt;
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-sm">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="font-medium text-gray-500 py-2">{d}</div>
                  ))}
                  {Array.from({ length: startPadding }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}
                  {days.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                        className={`py-2 rounded-lg text-sm transition-colors ${
                          isSelected
                            ? "bg-primary-600 text-white"
                            : isToday(day)
                            ? "bg-primary-50 text-primary-700 hover:bg-primary-100"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="input-field text-sm"
                  >
                    {Intl.supportedValuesOf("timeZone").map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                {selectedDate ? (
                  <div>
                    <h3 className="font-semibold mb-3">
                      {format(parseISO(selectedDate), "EEEE, MMMM d")}
                    </h3>
                    {loadingSlots ? (
                      <p className="text-gray-500">Loading slots...</p>
                    ) : slots.length === 0 ? (
                      <p className="text-gray-500">No available time slots</p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {slots.map((slot) => {
                          const isSelected = selectedSlot?.start === slot.start;
                          return (
                            <button
                              key={slot.start}
                              onClick={() => {
                                setSelectedSlot(slot);
                                setStep("form");
                              }}
                              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                                isSelected
                                  ? "border-primary-500 bg-primary-50"
                                  : "border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                              }`}
                            >
                              <span className="font-medium">
                                {format(new Date(slot.start), "HH:mm")}
                              </span>
                              <span className="text-gray-500">
                                {" "}- {format(new Date(slot.end), "HH:mm")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">Select a date to see available times</p>
                )}
              </div>
            </div>
          )}

          {step === "form" && selectedSlot && (
            <div>
              <button onClick={() => setStep("calendar")} className="text-primary-600 hover:underline text-sm mb-4">
                &larr; Back to calendar
              </button>
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="font-medium">{eventType.name} with {hostName}</p>
                <p className="text-sm text-gray-600">
                  {format(new Date(selectedSlot.start), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-gray-600">
                  {format(new Date(selectedSlot.start), "HH:mm")} - {format(new Date(selectedSlot.end), "HH:mm")} ({timezone})
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>
              )}

              <form onSubmit={handleBook} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="Please share anything that will help prepare for our meeting"
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={submitting}>
                  {submitting ? "Confirming..." : "Confirm Booking"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
