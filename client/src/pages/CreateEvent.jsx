import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eventsApi, venuesApi } from "../api/index.js";

export default function CreateEvent() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState("");
  const [form, setForm] = useState({ title: "", description: "", eventType: "movie", dateTime: "" });
  const [prices, setPrices] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    venuesApi.list().then((d) => setVenues(d.venues)).catch((e) => setError(e.message));
  }, []);

  const venue = venues.find((v) => v.id === venueId);
  const categoriesForVenue = venue ? [...new Set(venue.layout.map((r) => r.category))] : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!venueId) return setError("Choose a venue first");
    for (const cat of categoriesForVenue) {
      if (!prices[cat]) return setError(`Set a price for the "${cat}" category`);
    }
    setBusy(true);
    try {
      const { event } = await eventsApi.create({
        ...form,
        venueId,
        categoryPrices: Object.fromEntries(categoriesForVenue.map((c) => [c, Number(prices[c])])),
      });
      navigate(`/organiser`, { state: { createdEventId: event.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60, maxWidth: 640 }}>
      <h1 style={{ marginBottom: 20 }}>Create an event</h1>
      <div className="card">
        {error && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Inception: 15th Anniversary Re-release" />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Type</label>
              <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
                <option value="movie">Movie</option>
                <option value="concert">Concert</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Date &amp; time</label>
              <input
                type="datetime-local"
                required
                value={form.dateTime}
                onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>Venue</label>
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)} required>
              <option value="">Choose a venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.address}
                </option>
              ))}
            </select>
          </div>

          {venue && (
            <div className="field">
              <label>Pricing per seat category</label>
              <div className="stack" style={{ gap: 8 }}>
                {categoriesForVenue.map((cat) => (
                  <div className="row" key={cat} style={{ gap: 10 }}>
                    <span style={{ width: 110 }}>{cat}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Price (₹)"
                      value={prices[cat] || ""}
                      onChange={(e) => setPrices({ ...prices, [cat]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? "Creating..." : "Create event"}
          </button>
        </form>
      </div>
    </div>
  );
}
