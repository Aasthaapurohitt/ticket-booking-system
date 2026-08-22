import { Router } from "express";
import db from "../db/db.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { confirmBooking, cancelBooking, getBookingForUser } from "../services/bookingService.js";

const router = Router();

router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = db
      .prepare(
        `SELECT b.*, e.title as event_title, e.date_time, v.name as venue_name
         FROM bookings b
         JOIN events e ON e.id = b.event_id
         JOIN venues v ON v.id = e.venue_id
         WHERE b.user_id = ? ORDER BY b.created_at DESC`
      )
      .all(req.user.id);
    res.json({ bookings });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = getBookingForUser(req.params.id, req.user.id, req.user.role);
    const seats = db
      .prepare(
        `SELECT s.label, bs.price FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id WHERE bs.booking_id = ?`
      )
      .all(booking.id);
    res.json({ booking, seats });
  })
);

router.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.params.id) throw new ApiError(400, "Booking id required");
    const result = await cancelBooking(req.params.id, req.user.id, req.user.role);
    res.json({ booking: result });
  })
);

export default router;
