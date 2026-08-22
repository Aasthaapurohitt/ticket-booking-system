import db from "../db/db.js";
import { id as newId, bookingRef as newBookingRef } from "../utils/ids.js";
import { ApiError } from "../middleware/errorHandler.js";
import { emitSeatUpdate } from "../utils/events.js";
import { generateBookingQr } from "./qrService.js";
import { sendMail, bookingConfirmationEmail } from "./emailService.js";
import { offerSeatToNextInQueue } from "./waitlistService.js";

/**
 * Confirms a booking from one or more active holds belonging to the same
 * user + event. Runs as a single transaction so a hold that expires or is
 * stolen mid-request cannot be partially booked.
 */
const confirmTxn = db.transaction((holdIds, userId, eventId) => {
  const now = new Date().toISOString();
  const seatsForBooking = [];

  for (const holdId of holdIds) {
    const hold = db.prepare("SELECT * FROM holds WHERE id = ?").get(holdId);
    if (!hold) throw new ApiError(404, `Hold ${holdId} not found`);
    if (hold.user_id !== userId) throw new ApiError(403, "Hold does not belong to you");
    if (hold.event_id !== eventId) throw new ApiError(400, "Hold does not belong to this event");
    if (hold.status !== "ACTIVE") throw new ApiError(409, "Hold is no longer active");
    if (hold.expires_at < now) throw new ApiError(409, "Hold has expired, please reselect your seat");

    const seat = db.prepare("SELECT * FROM seats WHERE id = ?").get(hold.seat_id);
    const category = db.prepare("SELECT * FROM event_categories WHERE id = ?").get(seat.category_id);
    seatsForBooking.push({ hold, seat, category });
  }

  const totalAmount = seatsForBooking.reduce((sum, s) => sum + s.category.price, 0);
  const bookingId = newId();
  const ref = newBookingRef();

  db.prepare(
    `INSERT INTO bookings (id, booking_ref, user_id, event_id, status, total_amount) VALUES (?, ?, ?, ?, 'CONFIRMED', ?)`
  ).run(bookingId, ref, userId, eventId, totalAmount);

  for (const { hold, seat, category } of seatsForBooking) {
    db.prepare("UPDATE seats SET status = 'BOOKED' WHERE id = ?").run(seat.id);
    db.prepare("UPDATE holds SET status = 'CONVERTED' WHERE id = ?").run(hold.id);
    db.prepare(
      `INSERT INTO booking_seats (id, booking_id, seat_id, price) VALUES (?, ?, ?, ?)`
    ).run(newId(), bookingId, seat.id, category.price);
  }

  return { bookingId, ref, totalAmount, seatsForBooking };
});

export async function confirmBooking({ holdIds, userId, eventId }) {
  if (!Array.isArray(holdIds) || holdIds.length === 0) {
    throw new ApiError(400, "At least one holdId is required");
  }

  const { bookingId, ref, totalAmount, seatsForBooking } = confirmTxn(holdIds, userId, eventId);

  for (const { seat } of seatsForBooking) {
    emitSeatUpdate(eventId, { id: seat.id, status: "BOOKED" });
  }

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const seatLabels = seatsForBooking.map((s) => s.seat.label);

  const qrDataUrl = await generateBookingQr({ bookingRef: ref, eventId, seatLabels });
  db.prepare("UPDATE bookings SET qr_code = ? WHERE id = ?").run(qrDataUrl, bookingId);

  const { subject, html } = bookingConfirmationEmail({
    user,
    event,
    seats: seatsForBooking.map((s) => ({ label: s.seat.label, category: s.category.name, price: s.category.price })),
    bookingRef: ref,
    qrDataUrl,
    totalAmount,
  });

  let emailResult = null;
  try {
    emailResult = await sendMail({ to: user.email, subject, html });
  } catch (err) {
    // Booking must succeed even if the email provider is unreachable --
    // we log and surface it in the response rather than failing the booking.
    console.error("[email] failed to send booking confirmation:", err.message);
  }

  return {
    id: bookingId,
    bookingRef: ref,
    totalAmount,
    qrCode: qrDataUrl,
    seats: seatsForBooking.map((s) => s.seat.label),
    emailPreviewUrl: emailResult?.previewUrl || null,
  };
}

export function getBookingForUser(bookingId, userId, role) {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.user_id !== userId && role !== "admin") throw new ApiError(403, "Forbidden");
  return booking;
}

export async function cancelBooking(bookingId, userId, role) {
  const booking = getBookingForUser(bookingId, userId, role);
  if (booking.status !== "CONFIRMED") throw new ApiError(400, "Booking already cancelled");

  const seats = db
    .prepare(
      `SELECT s.* FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id WHERE bs.booking_id = ?`
    )
    .all(bookingId);

  const txn = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);
    for (const seat of seats) {
      db.prepare("UPDATE seats SET status = 'AVAILABLE' WHERE id = ?").run(seat.id);
    }
  });
  txn();

  for (const seat of seats) {
    emitSeatUpdate(booking.event_id, { id: seat.id, status: "AVAILABLE" });
  }

  // Waitlist auto-assignment: each freed seat is offered to the next
  // waiting customer in that seat's category queue (if any).
  for (const seat of seats) {
    await offerSeatToNextInQueue(booking.event_id, seat.category_id, seat.id);
  }

  return { id: bookingId, status: "CANCELLED" };
}
