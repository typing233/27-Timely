"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function CancelBookingPage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");

  useEffect(() => {
    fetch(`/api/bookings/cancel/${token}`, { method: "POST" })
      .then((res) => {
        if (res.ok) setStatus("success");
        else return res.json().then((d) => {
          if (d.error === "Already cancelled") setStatus("already");
          else setStatus("error");
        });
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card max-w-md text-center">
        {status === "loading" && <p>Cancelling your booking...</p>}
        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Cancelled</h1>
            <p className="text-gray-600">Your booking has been cancelled. Both parties have been notified.</p>
          </>
        )}
        {status === "already" && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Cancelled</h1>
            <p className="text-gray-600">This booking was already cancelled.</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Error</h1>
            <p className="text-gray-600">Unable to cancel this booking. The link may be invalid.</p>
          </>
        )}
      </div>
    </div>
  );
}
