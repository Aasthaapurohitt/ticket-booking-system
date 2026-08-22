import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { eventsApi, holdsApi, bookingsApi, waitlistApi } from "../api/index.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useEventSocket } from "../hooks/useEventSocket.js";
import SeatMap from "../components/SeatMap.jsx";
import Countdown from "../components/Countdown.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [seats, setSeats] = useState([]);
  const [holds, setHolds] = useState([]); // [{ seatId, holdId, expiresAt, seatLabel, price, categoryName }]
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [waitlistStatus, setWaitlistStatus] = useState({});

  const load = useCallback(() => {
    eventsApi
      .get(id)
      .then((d) => {
        setEvent(d.event);
        setCategories(d.categories);
        setSeats(d.seats);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEventSocket(id, {
    onSeatUpdate: (updated) => {
      setSeats((prev) => prev.map((s) => (s.id === updated.id ? { ...s, status: updated.status } : s)));
      // If a seat we were holding got externally reset to AVAILABLE, our
      // hold must have expired server-side -- drop it from local state too.
      setHolds((prev) => {
        const stillHeldByMe = prev.filter((h) => !(h.seatId === updated.id && updated.status !== "HELD"));
        if (stillHeldByMe.length !== prev.length) {
          setNotice("One of your held seats expired and was released.");
        }
        return stillHeldByMe;
      });
    },
  });

  const selectedSeatIds = useMemo(() => new Set(holds.map((h) => h.seatId)), [holds]);
  const myHeldSeatIds = selectedSeatIds;
  const totalAmount = holds.reduce((sum, h) => sum + h.price, 0);
  const earliestExpiry = holds.length ? holds.map((h) => h.expiresAt).sort()[0] : null;

  async function toggleSeat(seat) {
    if (!user) {
      navigate("/login", { state: { from: `/events/${id}` } });
      return;
    }
    setError(null);
    const existingHold = holds.find((h) => h.seatId === seat.id);
    if (existingHold) {
      try {
        await holdsApi.release(id, existingHold.holdId);
        setHolds((prev) => prev.filter((h) => h.seatId !== seat.id));
      } catch (e) {
        setError(e.message);
      }
      return;
    }
    try {
      const { hold } = await holdsApi.create(id, seat.id);
      const category = categories.find((c) => c.id === seat.category_id);
      setHolds((prev) => [
        ...prev,
        {
          seatId: seat.id,
          holdId: hold.id,
          expiresAt: hold.expiresAt,
          seatLabel: hold.seatLabel,
          price: category?.price || 0,
          categoryName: category?.name,
        },
      ]);
    } catch (e) {
      setError(e.message);
      load(); // seat status likely changed under us; resync
    }
  }

  async function handleExpire() {
    setNotice("Your seat hold expired. Please reselect your seats.");
    setHolds([]);
    load();
  }

  async function handleCheckout() {
    setBusy(true);
    setError(null);
    try {
      const { booking } = await bookingsApi.confirm(
        id,
        holds.map((h) => h.holdId)
      );
      navigate(`/bookings/${booking.id}/confirmation`, { state: { booking } });
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinWaitlist(category) {
    if (!user) {
      navigate("/login", { state: { from: `/events/${id}` } });
      return;
    }
    try {
      const { position } = await waitlistApi.join(id, category.id);
      setWaitlistStatus((prev) => ({ ...prev, [category.id]: { joined: true, position } }));
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !event) {
    return (
      <div className="container empty-state">
        <h3>Couldn't load this event</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (!event) return <div className="container empty-state">Loading event...</div>;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <div style={{ marginBottom: 8 }}>
        <span className={`event-type-tag ${event.event_type}`}>{event.event_type}</span>
      </div>
      <h1 style={{ marginBottom: 6 }}>{event.title}</h1>
      <p>
        {formatDate(event.date_time)} · {event.venue_name}, {event.venue_address}
      </p>
      {event.description && <p style={{ maxWidth: 640 }}>{event.description}</p>}

      <div className="grid-2" style={{ marginTop: 28 }}>
        <div className="card">
          <div className="spread" style={{ marginBottom: 8 }}>
            <h3>Select your seats</h3>
            {earliestExpiry && (
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Hold expires in</span>
                <Countdown expiresAt={earliestExpiry} onExpire={handleExpire} />
              </div>
            )}
          </div>
          {error && (
            <div className="badge badge-danger" style={{ marginBottom: 10 }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="badge badge-warn" style={{ marginBottom: 10 }}>
              {notice}
            </div>
          )}
          <SeatMap
            seats={seats}
            selectedSeatIds={selectedSeatIds}
            myHeldSeatIds={myHeldSeatIds}
            onToggleSeat={toggleSeat}
          />
        </div>

        <div className="stack">
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Categories</h3>
            <div className="stack">
              {categories.map((cat) => (
                <div key={cat.id} className="spread">
                  <div>
                    <div style={{ fontWeight: 600 }}>{cat.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {cat.available} of {cat.total} available
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)" }}>₹{cat.price}</div>
                    {cat.available === 0 &&
                      (waitlistStatus[cat.id]?.joined ? (
                        <span className="badge badge-warn">
                          Waitlisted{waitlistStatus[cat.id].position ? ` · #${waitlistStatus[cat.id].position}` : ""}
                        </span>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleJoinWaitlist(cat)}>
                          Join waitlist
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Your selection</h3>
            {holds.length === 0 ? (
              <p style={{ fontSize: "0.85rem" }}>Tap available seats on the map to hold them.</p>
            ) : (
              <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
                {holds.map((h) => (
                  <div key={h.seatId} className="spread" style={{ fontSize: "0.88rem" }}>
                    <span>
                      {h.seatLabel} <span style={{ color: "var(--text-muted)" }}>({h.categoryName})</span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>₹{h.price}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="hairline" />
            <div className="spread" style={{ marginBottom: 14 }}>
              <strong>Total</strong>
              <strong style={{ fontFamily: "var(--font-mono)" }}>₹{totalAmount}</strong>
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={holds.length === 0 || busy}
              onClick={handleCheckout}
            >
              {busy ? "Confirming..." : `Confirm booking (${holds.length} seat${holds.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
