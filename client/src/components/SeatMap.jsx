const CATEGORY_ORDER_HINT = {}; // rows render in whatever order the API returns them

export default function SeatMap({ seats, selectedSeatIds, myHeldSeatIds, onToggleSeat }) {
  const rows = {};
  for (const seat of seats) {
    if (!rows[seat.row_label]) rows[seat.row_label] = [];
    rows[seat.row_label].push(seat);
  }
  const rowLabels = Object.keys(rows).sort();

  function seatClass(seat) {
    if (selectedSeatIds.has(seat.id)) return "seat seat-selected";
    if (seat.status === "BOOKED") return "seat seat-booked";
    if (seat.status === "HELD") {
      // A seat this same user is holding still shows as selected-style so
      // they recognize their own in-progress pick, not as "taken".
      return myHeldSeatIds.has(seat.id) ? "seat seat-selected" : "seat seat-held";
    }
    return "seat seat-available";
  }

  function isClickable(seat) {
    if (seat.status === "BOOKED") return false;
    if (seat.status === "HELD" && !myHeldSeatIds.has(seat.id)) return false;
    return true;
  }

  return (
    <div>
      <div className="seat-screen" aria-hidden="true" />
      <div className="seat-map">
        {rowLabels.map((label) => (
          <div className="seat-row" key={label}>
            <span className="seat-row-label">{label}</span>
            {rows[label]
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  className={seatClass(seat)}
                  disabled={!isClickable(seat)}
                  title={`${seat.label} — ${seat.status}`}
                  onClick={() => isClickable(seat) && onToggleSeat(seat)}
                >
                  {seat.seat_number}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="seat-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "transparent", border: "1px solid var(--teal)" }} />
          Available
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--amber)" }} />
          Selected / your hold
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--surface-3)" }} />
          Held by someone else
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--crimson-dim)", border: "1px solid var(--crimson)" }} />
          Booked
        </span>
      </div>
    </div>
  );
}
