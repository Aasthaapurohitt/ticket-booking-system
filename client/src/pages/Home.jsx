import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { eventsApi } from "../api/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Home() {
  const [events, setEvents] = useState(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      eventsApi
        .list({ search: search || undefined, type: type || undefined })
        .then((d) => setEvents(d.events))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, type]);

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div style={{ marginBottom: 32 }}>
        <h1>Now booking</h1>
        <p style={{ maxWidth: 520 }}>
          Reserve your seat from a live visual map. Held seats release automatically if checkout is abandoned —
          no double-booking, ever.
        </p>
      </div>

      <div className="row" style={{ marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Search events or venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "var(--text)",
            minWidth: 260,
          }}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "var(--text)",
          }}
        >
          <option value="">All types</option>
          <option value="movie">Movies</option>
          <option value="concert">Concerts</option>
        </select>
      </div>

      {error && <div className="badge badge-danger">{error}</div>}

      {!events && (
        <div className="event-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 240 }} />
          ))}
        </div>
      )}

      {events && events.length === 0 && (
        <div className="empty-state">
          <h3>No events match</h3>
          <p>Try a different search term or clear the filter.</p>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="event-grid">
          {events.map((ev) => (
            <Link to={`/events/${ev.id}`} key={ev.id} className="event-card card-hover">
              <div className="event-poster">
                <span className={`event-type-tag ${ev.event_type}`}>{ev.event_type}</span>
              </div>
              <div className="event-card-body">
                <div className="event-title">{ev.title}</div>
                <div className="event-meta">
                  <span>{formatDate(ev.date_time)}</span>
                  <span>{ev.venue_name}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
