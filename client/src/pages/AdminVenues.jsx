import { useCallback, useEffect, useState } from "react";
import { venuesApi } from "../api/index.js";

const EMPTY_ROW = { rowLabel: "", category: "", seatCount: "" };

export default function AdminVenues() {
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);

  const load = useCallback(() => {
    venuesApi.list().then((d) => setVenues(d.venues)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateRow(i, key, value) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const layout = rows
      .filter((r) => r.rowLabel && r.category && r.seatCount)
      .map((r) => ({ rowLabel: r.rowLabel.toUpperCase(), category: r.category, seatCount: Number(r.seatCount) }));
    if (layout.length === 0) return setError("Add at least one seat row");
    setBusy(true);
    try {
      await venuesApi.create({ ...form, layout });
      setForm({ name: "", address: "" });
      setRows([{ ...EMPTY_ROW }]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 style={{ marginBottom: 24 }}>Manage venues</h1>

      <div className="grid-2">
        <div className="stack">
          {!venues && <div className="skeleton" style={{ height: 100 }} />}
          {(venues || []).map((v) => (
            <div key={v.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{v.name}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 10 }}>{v.address}</div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {v.layout.map((row) => (
                  <span key={row.rowLabel} className="badge badge-muted">
                    Row {row.rowLabel}: {row.seatCount} × {row.category}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {venues && venues.length === 0 && (
            <div className="empty-state">
              <h3>No venues yet</h3>
              <p>Add one using the form to let organisers create events there.</p>
            </div>
          )}
        </div>

        <div className="card" style={{ height: "fit-content" }}>
          <h3 style={{ marginBottom: 12 }}>Add a venue</h3>
          {error && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field">
              <label>Seat layout (rows)</label>
              <div className="stack" style={{ gap: 8 }}>
                {rows.map((row, i) => (
                  <div key={i} className="row" style={{ gap: 8 }}>
                    <input
                      placeholder="Row (e.g. A)"
                      style={{ width: 70 }}
                      value={row.rowLabel}
                      onChange={(e) => updateRow(i, "rowLabel", e.target.value)}
                    />
                    <input
                      placeholder="Category (e.g. Premium)"
                      value={row.category}
                      onChange={(e) => updateRow(i, "category", e.target.value)}
                    />
                    <input
                      placeholder="Seats"
                      type="number"
                      min="1"
                      style={{ width: 80 }}
                      value={row.seatCount}
                      onChange={(e) => updateRow(i, "seatCount", e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
              >
                + Add row
              </button>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? "Creating..." : "Create venue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
