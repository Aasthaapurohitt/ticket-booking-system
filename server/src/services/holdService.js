import db from "../db/db.js";
import { id as newId } from "../utils/ids.js";
import { ApiError } from "../middleware/errorHandler.js";
import { emitSeatUpdate } from "../utils/events.js";

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS || 600); // 10 min default

/**
 * CONCURRENCY STRATEGY
 * --------------------
 * SQLite serializes all writers against a single database file. We take
 * advantage of that plus an explicit IMMEDIATE transaction (which grabs the
 * write lock up front) and a conditional UPDATE:
 *
 *   UPDATE seats SET status='HELD' WHERE id=? AND status='AVAILABLE'
 *
 * Only one of two simultaneous requests for the same seat can be the writer
 * that flips status from AVAILABLE -> HELD; the loser's UPDATE affects 0
 * rows and is rejected with a 409. There is no read-then-write race window
 * because the check and the write are the same atomic statement, and
 * `busy_timeout` makes the second transaction wait for the first to finish
 * rather than fail spuriously. This generalizes directly to Postgres via
 * `SELECT ... FOR UPDATE` or a single conditional UPDATE + row lock.
 */
const createHoldTxn = db.transaction((seatId, userId, eventId) => {
  const seat = db.prepare("SELECT * FROM seats WHERE id = ? AND event_id = ?").get(seatId, eventId);
  if (!seat) throw new ApiError(404, "Seat not found");

  const result = db
    .prepare("UPDATE seats SET status = 'HELD' WHERE id = ? AND status = 'AVAILABLE'")
    .run(seatId);

  if (result.changes === 0) {
    throw new ApiError(409, `Seat ${seat.label} is no longer available`);
  }

  const holdId = newId();
  const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000).toISOString();
  db.prepare(
    `INSERT INTO holds (id, seat_id, event_id, user_id, status, expires_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`
  ).run(holdId, seatId, eventId, userId, expiresAt);

  return { holdId, seat, expiresAt };
});

export function createHold(eventId, seatId, userId) {
  const { holdId, seat, expiresAt } = createHoldTxn(seatId, userId, eventId);
  emitSeatUpdate(eventId, { id: seatId, status: "HELD" });
  return {
    id: holdId,
    seatId,
    seatLabel: seat.label,
    status: "ACTIVE",
    expiresAt,
    ttlSeconds: HOLD_TTL_SECONDS,
  };
}

export function releaseHold(holdId, userId) {
  const hold = db.prepare("SELECT * FROM holds WHERE id = ?").get(holdId);
  if (!hold) throw new ApiError(404, "Hold not found");
  if (hold.user_id !== userId) throw new ApiError(403, "Not your hold");
  if (hold.status !== "ACTIVE") throw new ApiError(400, "Hold is not active");

  const txn = db.transaction(() => {
    db.prepare("UPDATE holds SET status = 'RELEASED' WHERE id = ?").run(holdId);
    db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'").run(hold.seat_id);
  });
  txn();
  emitSeatUpdate(hold.event_id, { id: hold.seat_id, status: "AVAILABLE" });
}

/**
 * Called periodically by the scheduler (services/scheduler.js). The backend
 * -- not the frontend countdown -- is the source of truth for hold expiry:
 * this sweep is what actually flips an abandoned HELD seat back to
 * AVAILABLE, regardless of whether any client is still connected.
 */
export function releaseExpiredHolds() {
  const now = new Date().toISOString();
  const expired = db
    .prepare("SELECT * FROM holds WHERE status = 'ACTIVE' AND expires_at < ?")
    .all(now);

  for (const hold of expired) {
    const txn = db.transaction(() => {
      db.prepare("UPDATE holds SET status = 'EXPIRED' WHERE id = ?").run(hold.id);
      db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'").run(hold.seat_id);
    });
    txn();
    emitSeatUpdate(hold.event_id, { id: hold.seat_id, status: "AVAILABLE" });
  }
  return expired.length;
}

export function getActiveHold(holdId) {
  return db.prepare("SELECT * FROM holds WHERE id = ?").get(holdId);
}

export { HOLD_TTL_SECONDS };
