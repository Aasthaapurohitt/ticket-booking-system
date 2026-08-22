import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bookingsApi, waitlistApi } from "../api/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    bookingsApi.my().then((d) => setBookings(d.bookings)).catch((e) => setError(e.message));
    waitlistApi.my().then((d) => setWaitlist(d.waitlist)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(id) {
    if (!window.confirm("Cancel this booking? This will release your seats.")) return;
    setBusyId(id);
    try {
      await bookingsApi.cancel(id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptOffer(entryId) {
    setBusyId(entryId);
    try {
      const { booking } = await waitlistApi.confirm(entryId);
      window.location.href = `/bookings/${booking.id}/confirmation`;
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setBusyId(null);
    }
  }

  const offers = (waitlist || []).filter((w) => w.status === "OFFERED");
  const waiting = (waitlist || []).filter((w) => w.status === "WAITING");

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 style={{ marginBottom: 24 }}>My bookings</h1>
      {error && <div className="badge badge-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {offers.length > 0 && (
        <div className="stack" style={{ marginBottom: 28 }}>
          <h3>Seat offers waiting for you</h3>
          {offers.map((o) => (
            <div key={o.id} className="card" style={{ borderColor: "var(--amber)" }}>
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 600 }}>{o.event_title}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    {o.category_name} seat available — offer expires {formatDate(o.offer_expires_at)}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" disabled={busyId === o.id} onClick={() => handleAcceptOffer(o.id)}>
                  {busyId === o.id ? "Booking..." : "Complete booking"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="stack" style={{ marginBottom: 28 }}>
          <h3>On the waitlist</h3>
          {waiting.map((w) => (
            <div key={w.id} className="card">
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 600 }}>{w.event_title}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{w.category_name}</div>
                </div>
                <span className="badge badge-warn">Position #{w.position ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>Booking history</h3>
      {!bookings && <div className="skeleton" style={{ height: 90 }} />}
      {bookings && bookings.length === 0 && (
        <div className="empty-state">
          <h3>No bookings yet</h3>
          <p>Once you book seats they'll show up here with your QR ticket.</p>
          <Link className="btn btn-primary" to="/">Browse events</Link>
        </div>
      )}
      <div className="stack">
        {(bookings || []).map((b) => (
          <div key={b.id} className="card">
            <div className="spread">
              <div>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{b.event_title}</span>
                  <span className={`badge ${b.status === "CONFIRMED" ? "badge-success" : "badge-muted"}`}>
                    {b.status}
                  </span>
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {formatDate(b.date_time)} · {b.venue_name}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", marginTop: 4, color: "var(--amber)" }}>
                  {b.booking_ref}
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>₹{b.total_amount}</div>
                <Link className="btn btn-ghost btn-sm" to={`/bookings/${b.id}/confirmation`}>
                  View ticket
                </Link>
                {b.status === "CONFIRMED" && (
                  <button className="btn btn-danger btn-sm" disabled={busyId === b.id} onClick={() => handleCancel(b.id)}>
                    {busyId === b.id ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
