import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { bookingsApi } from "../api/index.js";

export default function BookingConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [data, setData] = useState(location.state?.booking ? { booking: location.state.booking, seats: null } : null);
  const [error, setError] = useState(null);

  useEffect(() => {
    bookingsApi
      .get(id)
      .then((d) =>
        setData({
          booking: { ...d.booking, bookingRef: d.booking.booking_ref, qrCode: d.booking.qr_code, totalAmount: d.booking.total_amount },
          seats: d.seats,
        })
      )
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="container empty-state">{error}</div>;
  if (!data) return <div className="container empty-state">Loading your ticket...</div>;

  const { booking, seats } = data;
  const seatLabels = seats ? seats.map((s) => s.label) : booking.seats || [];

  return (
    <div className="container" style={{ paddingTop: 48, paddingBottom: 60, maxWidth: 720 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span className="badge badge-success" style={{ marginBottom: 10 }}>
          Booking confirmed
        </span>
        <h1>You're going 🎟️</h1>
        <p>A confirmation email with your QR ticket has been sent — bring it to the venue entrance.</p>
      </div>

      <div className="ticket-stub">
        <div className="ticket-main">
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>BOOKING REFERENCE</div>
          <div className="ticket-ref" style={{ marginBottom: 18 }}>
            {booking.bookingRef}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Seats</div>
              <div style={{ fontWeight: 600 }}>{seatLabels.join(", ") || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Total paid</div>
              <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>₹{booking.totalAmount}</div>
            </div>
          </div>
        </div>
        <div className="ticket-side">
          {booking.qrCode ? (
            <img src={booking.qrCode} alt="Booking QR code" width={110} height={110} style={{ borderRadius: 8 }} />
          ) : (
            <div className="skeleton" style={{ width: 110, height: 110 }} />
          )}
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textAlign: "center" }}>
            Scan at entrance
          </div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 28 }}>
        <Link className="btn btn-ghost" to="/bookings">
          View all bookings
        </Link>
        <Link className="btn btn-primary" to="/">
          Browse more events
        </Link>
      </div>
    </div>
  );
}
