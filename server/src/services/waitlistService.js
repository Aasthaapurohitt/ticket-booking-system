import db from "../db/db.js";
import { id as newId } from "../utils/ids.js";
import { ApiError } from "../middleware/errorHandler.js";
import { emitSeatUpdate, emitWaitlistUpdate } from "../utils/events.js";
import { sendMail, waitlistOfferEmail } from "./emailService.js";

const OFFER_TTL_SECONDS = Number(process.env.WAITLIST_OFFER_TTL_SECONDS || 900); // 15 min default
const APP_URL = process.env.APP_URL || "http://localhost:5173";

/**
 * Join the waitlist for a (event, category). Only allowed once a category
 * has no AVAILABLE seats left, and a user cannot join the same queue twice.
 * Queue order is FIFO by created_at (position_hint is stored for display
 * but the source of truth is created_at + status).
 */
export function joinWaitlist(eventId, categoryId, userId) {
  const availableCount = db
    .prepare("SELECT COUNT(*) c FROM seats WHERE event_id = ? AND category_id = ? AND status = 'AVAILABLE'")
    .get(eventId, categoryId).c;
  if (availableCount > 0) {
    throw new ApiError(400, "Seats are still available in this category; no need to join the waitlist");
  }

  const existing = db
    .prepare("SELECT * FROM waitlist WHERE event_id = ? AND category_id = ? AND user_id = ? AND status IN ('WAITING','OFFERED')")
    .get(eventId, categoryId, userId);
  if (existing) throw new ApiError(409, "You are already on the waitlist for this category");

  const entryId = newId();
  db.prepare(
    `INSERT INTO waitlist (id, event_id, category_id, user_id, status) VALUES (?, ?, ?, ?, 'WAITING')`
  ).run(entryId, eventId, categoryId, userId);

  return getWaitlistEntry(entryId);
}

export function getWaitlistEntry(id) {
  return db.prepare("SELECT * FROM waitlist WHERE id = ?").get(id);
}

export function queuePosition(entryId) {
  const entry = getWaitlistEntry(entryId);
  if (!entry || entry.status !== "WAITING") return null;
  const ahead = db
    .prepare(
      `SELECT COUNT(*) c FROM waitlist WHERE event_id = ? AND category_id = ? AND status = 'WAITING' AND created_at < ?`
    )
    .get(entry.event_id, entry.category_id, entry.created_at).c;
  return ahead + 1;
}

/**
 * Offers a freshly-freed seat to the next WAITING customer in that
 * category's queue. The seat is put into HELD (not AVAILABLE) so it is
 * reserved for the offer and cannot be grabbed by a browsing customer.
 * If nobody is waiting, the seat is left AVAILABLE for anyone to book.
 */
export async function offerSeatToNextInQueue(eventId, categoryId, seatId) {
  const next = db
    .prepare(
      `SELECT * FROM waitlist WHERE event_id = ? AND category_id = ? AND status = 'WAITING' ORDER BY created_at ASC LIMIT 1`
    )
    .get(eventId, categoryId);

  if (!next) return null; // no one waiting; seat stays AVAILABLE

  const expiresAt = new Date(Date.now() + OFFER_TTL_SECONDS * 1000).toISOString();

  const txn = db.transaction(() => {
    const result = db
      .prepare("UPDATE seats SET status = 'HELD' WHERE id = ? AND status = 'AVAILABLE'")
      .run(seatId);
    if (result.changes === 0) throw new ApiError(409, "Seat is no longer available to offer");

    db.prepare(
      `UPDATE waitlist SET status = 'OFFERED', offer_seat_id = ?, offer_expires_at = ? WHERE id = ?`
    ).run(seatId, expiresAt, next.id);
  });
  txn();

  emitSeatUpdate(eventId, { id: seatId, status: "HELD" });
  const updatedEntry = getWaitlistEntry(next.id);
  emitWaitlistUpdate(eventId, updatedEntry);

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(next.user_id);
  const seat = db.prepare("SELECT * FROM seats WHERE id = ?").get(seatId);
  const category = db.prepare("SELECT * FROM event_categories WHERE id = ?").get(categoryId);

  const { subject, html } = waitlistOfferEmail({
    user,
    event,
    seat: { label: seat.label, category: category.name },
    offerExpiresAt: expiresAt,
    offerUrl: `${APP_URL}/waitlist/${next.id}`,
  });

  try {
    await sendMail({ to: user.email, subject, html });
  } catch (err) {
    console.error("[email] failed to send waitlist offer:", err.message);
  }

  return updatedEntry;
}

/**
 * Customer accepts a time-limited waitlist offer. Because the seat was
 * already reserved (HELD) for this specific user when the offer was made,
 * confirmation here just needs to validate ownership + expiry and then
 * book it directly -- no separate hold step is required.
 */
export async function confirmWaitlistOffer(entryId, userId) {
  const entry = getWaitlistEntry(entryId);
  if (!entry) throw new ApiError(404, "Waitlist entry not found");
  if (entry.user_id !== userId) throw new ApiError(403, "This offer does not belong to you");
  if (entry.status !== "OFFERED") throw new ApiError(400, "This offer is not currently active");
  if (entry.offer_expires_at < new Date().toISOString()) {
    throw new ApiError(409, "This offer has expired");
  }

  // Reuses the booking confirmation path by creating a short-lived hold
  // record for the already-reserved seat, then confirming through it.
  const holdId = newId();
  const seat = db.prepare("SELECT * FROM seats WHERE id = ?").get(entry.offer_seat_id);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO holds (id, seat_id, event_id, user_id, status, expires_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)`
    ).run(holdId, seat.id, entry.event_id, userId, entry.offer_expires_at);
    db.prepare("UPDATE waitlist SET status = 'CONFIRMED' WHERE id = ?").run(entryId);
  })();

  emitWaitlistUpdate(entry.event_id, getWaitlistEntry(entryId));

  return { holdId, eventId: entry.event_id, seatId: seat.id };
}

/**
 * Called periodically by the scheduler. Any OFFERED entry whose offer
 * window has lapsed is expired, and the seat is passed to the next
 * customer in line (or released to AVAILABLE if the queue is empty).
 */
export async function expireStaleOffers() {
  const now = new Date().toISOString();
  const stale = db
    .prepare("SELECT * FROM waitlist WHERE status = 'OFFERED' AND offer_expires_at < ?")
    .all(now);

  for (const entry of stale) {
    db.prepare("UPDATE waitlist SET status = 'EXPIRED' WHERE id = ?").run(entry.id);
    emitWaitlistUpdate(entry.event_id, getWaitlistEntry(entry.id));

    // Seat is still HELD from the expired offer; release it back to
    // AVAILABLE first, then try to hand it to whoever is next.
    db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ? AND status = 'HELD'").run(entry.offer_seat_id);
    emitSeatUpdate(entry.event_id, { id: entry.offer_seat_id, status: "AVAILABLE" });

    await offerSeatToNextInQueue(entry.event_id, entry.category_id, entry.offer_seat_id);
  }
  return stale.length;
}

export function listWaitlistForUser(userId) {
  return db
    .prepare(
      `SELECT w.*, e.title as event_title, ec.name as category_name
       FROM waitlist w
       JOIN events e ON e.id = w.event_id
       JOIN event_categories ec ON ec.id = w.category_id
       WHERE w.user_id = ? ORDER BY w.created_at DESC`
    )
    .all(userId);
}

export { OFFER_TTL_SECONDS };
