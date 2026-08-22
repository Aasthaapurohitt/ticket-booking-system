import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { organiserApi } from "../api/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function EventSummary({ eventId }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    organiserApi.summary(eventId).then((d) => setSummary(d)).catch(() => {});
  }, [eventId]);

  if (!summary) return <div className="skeleton" style={{ height: 60 }} />;

  const booked = summary.seatTotals.find((s) => s.status === "BOOKED")?.count || 0;
  const held = summary.seatTotals.find((s) => s.status === "HELD")?.count || 0;
  const available = summary.seatTotals.find((s) => s.status === "AVAILABLE")?.count || 0;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Revenue</div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.1rem" }}>
            ₹{summary.revenue.total}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Bookings</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{summary.revenue.bookingCount}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Seats</div>
          <div style={{ fontSize: "0.9rem" }}>
            {booked} booked · {held} held · {available} available
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Waitlist</div>
          <div style={{ fontSize: "0.9rem" }}>{summary.waitlistCount} waiting</div>
        </div>
      </div>
      <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
        {summary.byCategory.map((c) => (
          <span key={c.name} className="badge badge-muted">
            {c.name}: {c.seatsSold} sold · ₹{c.revenue}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function OrganiserDashboard() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    organiserApi.events().then((d) => setEvents(d.events)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <div className="spread" style={{ marginBottom: 24 }}>
        <h1>Organiser dashboard</h1>
        <Link className="btn btn-primary" to="/organiser/new-event">
          + New event
        </Link>
      </div>
      {error && <div className="badge badge-danger" style={{ marginBottom: 16 }}>{error}</div>}

      {!events && <div className="skeleton" style={{ height: 140 }} />}
      {events && events.length === 0 && (
        <div className="empty-state">
          <h3>No events yet</h3>
          <p>Create your first listing to start selling tickets.</p>
          <Link className="btn btn-primary" to="/organiser/new-event">Create an event</Link>
        </div>
      )}

      <div className="stack" style={{ gap: 18 }}>
        {(events || []).map((ev) => (
          <div key={ev.id} className="card">
            <div className="spread" style={{ marginBottom: 12 }}>
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`event-type-tag ${ev.event_type}`}>{ev.event_type}</span>
                  <span style={{ fontWeight: 700 }}>{ev.title}</span>
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
                  {formatDate(ev.date_time)} · {ev.venue_name}
                </div>
              </div>
              <Link className="btn btn-ghost btn-sm" to={`/events/${ev.id}`}>
                View public page
              </Link>
            </div>
            <div className="hairline" />
            <EventSummary eventId={ev.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
